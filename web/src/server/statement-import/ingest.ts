import { createHash } from 'node:crypto';

import { and, eq, ne } from 'drizzle-orm';

import {
  creditCardAccounts,
  statementImports,
  statementSources,
  type StatementImportRow,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { assertOwnsAccountsAndFriends } from '@/server/helpers/account';

import { finalizeStatement } from './finalize';
import { extractPdfLines, PdfPasswordError } from './pdf/extract';
import { parseStatementLines } from './pdf/parse';
import { roundMoney } from './pdf/values';
import { openPassword, sealPassword } from './secrets';
import { parseSheetRows, readSheetRows } from './sheet/parse';
import { type ParsedStatement, type StatementKind } from './types';

const ROUNDING_SLACK = 1;
const DAY_MS = 86_400_000;
const ISO_DATE_LENGTH = 10;
const BREAKDOWN = /^INTEREST ON EMI/i;
const PDF_MAGIC = '%PDF';
const SHEET_ISSUER = 'sheet';

export class StatementAccountRequiredError extends Error {
  constructor(
    readonly issuer: string,
    readonly accountLast4: string | null,
  ) {
    super('Choose which account this statement belongs to');
  }
}

export type IngestInput = {
  data: Uint8Array;
  fileName: string;
  password?: string;
  accountId?: string;
  rememberPassword: boolean;
  source: 'upload' | 'email';
  inboundEmailId?: string;
};

export type IngestResult = { importId: string; duplicate: boolean };

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, ISO_DATE_LENGTH);

const movementRows = (statement: ParsedStatement): StatementImportRow[] => {
  const installmentDays = new Set(
    statement.transactions.filter((row) => row.emi === 'installment').map((row) => row.date),
  );
  return statement.transactions
    .filter((row) => !(installmentDays.has(row.date) && BREAKDOWN.test(row.description)))
    .map((row) => ({
      date: row.date,
      description: row.description,
      amount: row.amount,
      direction: row.direction,
      emi: row.emi,
    }));
};

const signedMovement = (rows: StatementImportRow[], kind: StatementKind) =>
  roundMoney(
    rows.reduce(
      (sum, row) =>
        sum +
        (row.direction === 'debit' ? row.amount : -row.amount) * (kind === 'credit_card' ? 1 : -1),
      0,
    ),
  );

const cardOutstanding = (
  statement: ParsedStatement,
  movement: number,
  previousClosing: number | null,
) => {
  if (statement.closingBalance === null) {
    return null;
  }
  for (const opening of [statement.openingBalance, previousClosing]) {
    if (
      opening !== null &&
      Math.abs(opening + movement - statement.closingBalance) < ROUNDING_SLACK
    ) {
      return roundMoney(opening + movement);
    }
  }
  return statement.closingBalance;
};

const appBalances = (
  statement: ParsedStatement,
  movement: number,
  previousAppClosing: number | null,
) => {
  if (statement.kind === 'bank_account') {
    const closing = statement.closingBalance;
    return closing === null ? null : { opening: roundMoney(closing - movement), closing };
  }
  const outstanding = cardOutstanding(
    statement,
    movement,
    previousAppClosing === null ? null : -previousAppClosing,
  );
  return outstanding === null
    ? null
    : { opening: -roundMoney(outstanding - movement), closing: -outstanding };
};

const isPdf = (data: Uint8Array) =>
  new TextDecoder().decode(data.subarray(0, PDF_MAGIC.length)) === PDF_MAGIC;

const readLines = async (data: Uint8Array, passwords: Array<string | undefined>) => {
  let lastError: PdfPasswordError | null = null;
  for (const password of passwords) {
    try {
      return { lines: await extractPdfLines(new Uint8Array(data), password), password };
    } catch (error) {
      if (!(error instanceof PdfPasswordError)) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError ?? new PdfPasswordError(true);
};

const pickSource = (
  sources: Array<typeof statementSources.$inferSelect>,
  statement: ParsedStatement,
) => {
  if (statement.issuer === SHEET_ISSUER) {
    const byDigits = sources.filter(
      (source) => statement.accountLast4 !== null && source.cardLast4 === statement.accountLast4,
    );
    return byDigits.length === 1 ? byDigits[0] : undefined;
  }
  const sameIssuer = sources.filter((source) => source.issuer === statement.issuer);
  const exact = sameIssuer.filter(
    (source) => statement.accountLast4 !== null && source.cardLast4 === statement.accountLast4,
  );
  if (exact.length === 1) {
    return exact[0];
  }
  return sameIssuer.length === 1 ? sameIssuer[0] : undefined;
};

export const ingestStatementFile = instrumentedFunction(
  'ingestStatementFile',
  async (db: Database, userId: string, input: IngestInput): Promise<IngestResult> => {
    const fileHash = createHash('sha256').update(input.data).digest('hex');
    const existing = await db
      .select({ id: statementImports.id })
      .from(statementImports)
      .where(and(eq(statementImports.userId, userId), eq(statementImports.fileHash, fileHash)))
      .limit(1);
    const found = existing.at(0);
    if (found !== undefined) {
      return { importId: found.id, duplicate: true };
    }

    if (input.accountId !== undefined) {
      await assertOwnsAccountsAndFriends(db, userId, { accountIds: [input.accountId] });
    }

    const sources = await db
      .select()
      .from(statementSources)
      .where(eq(statementSources.userId, userId));
    const saved = sources
      .toSorted(
        (left, right) =>
          Number(right.accountId === input.accountId) - Number(left.accountId === input.accountId),
      )
      .map((source) => (source.password === null ? null : openPassword(source.password)))
      .filter((password) => password !== null);

    const hasInput = input.password !== undefined && input.password !== '';
    let parsed: ParsedStatement;
    let usedPassword: string | undefined;
    if (isPdf(input.data)) {
      const attempts: Array<string | undefined> = hasInput
        ? [input.password]
        : [undefined, ...saved];
      try {
        const read = await readLines(input.data, attempts);
        usedPassword = read.password;
        parsed = parseStatementLines(read.lines);
      } catch (error) {
        if (error instanceof PdfPasswordError) {
          throw new PdfPasswordError(!hasInput);
        }
        throw error;
      }
    } else {
      parsed = finalizeStatement(parseSheetRows(readSheetRows(input.data)));
    }
    if (parsed.periodStart === null || parsed.periodEnd === null) {
      throw new Error('Could not read the statement period from this file');
    }

    const accountId = input.accountId ?? pickSource(sources, parsed)?.accountId;
    if (accountId === undefined) {
      throw new StatementAccountRequiredError(parsed.issuer, parsed.accountLast4);
    }

    const isCard =
      (
        await db
          .select({ id: creditCardAccounts.id })
          .from(creditCardAccounts)
          .where(eq(creditCardAccounts.accountId, accountId))
          .limit(1)
      ).length > 0;
    const statement: ParsedStatement =
      parsed.issuer === SHEET_ISSUER
        ? finalizeStatement({
            ...parsed,
            kind: isCard ? 'credit_card' : 'bank_account',
            openingBalance: isCard ? null : parsed.openingBalance,
            closingBalance: isCard ? null : parsed.closingBalance,
          })
        : parsed;
    const periodStart = statement.periodStart ?? parsed.periodStart;
    const periodEnd = statement.periodEnd ?? parsed.periodEnd;

    const samePeriod = (
      await db
        .select({ id: statementImports.id })
        .from(statementImports)
        .where(
          and(
            eq(statementImports.accountId, accountId),
            eq(statementImports.periodStart, periodStart),
            eq(statementImports.periodEnd, periodEnd),
            ne(statementImports.status, 'discarded'),
          ),
        )
        .limit(1)
    ).at(0);
    if (samePeriod !== undefined) {
      return { importId: samePeriod.id, duplicate: true };
    }

    const rows = movementRows(statement);
    const movement = signedMovement(rows, statement.kind);
    const previous = await db
      .select({ closingBalance: statementImports.closingBalance })
      .from(statementImports)
      .where(
        and(
          eq(statementImports.accountId, accountId),
          eq(statementImports.periodEnd, addDays(periodStart, -1)),
        ),
      )
      .limit(1);
    const previousClosing = previous.at(0)?.closingBalance;
    const balances = appBalances(
      statement,
      movement,
      previousClosing === undefined || previousClosing === null ? null : Number(previousClosing),
    );

    const created = (
      await db
        .insert(statementImports)
        .values({
          userId,
          accountId,
          source: input.source,
          inboundEmailId: input.inboundEmailId ?? null,
          fileName: input.fileName,
          fileHash,
          issuer: statement.issuer,
          periodStart,
          periodEnd,
          statementDate: statement.statementDate,
          openingBalance: balances === null ? null : String(balances.opening),
          closingBalance: balances === null ? null : String(balances.closing),
          totalDue: statement.closingBalance === null ? null : String(statement.closingBalance),
          rows,
          summary: {
            kind: statement.kind,
            dueDate: statement.dueDate,
            minimumDue: statement.minimumDue,
            creditLimit: statement.creditLimit,
            cardLast4: statement.accountLast4,
            declared: statement.declared,
            totals: statement.totals,
          },
        })
        .returning({ id: statementImports.id })
    ).at(0);
    if (created === undefined) {
      throw new Error('Could not save the statement');
    }

    if (statement.issuer === SHEET_ISSUER && statement.accountLast4 === null) {
      return { importId: created.id, duplicate: false };
    }
    const sealed =
      input.rememberPassword && usedPassword !== undefined ? sealPassword(usedPassword) : null;
    await db
      .insert(statementSources)
      .values({
        accountId,
        userId,
        issuer: statement.issuer,
        cardLast4: statement.accountLast4,
        password: sealed,
      })
      .onConflictDoUpdate({
        target: statementSources.accountId,
        set: {
          ...(statement.issuer === SHEET_ISSUER ? {} : { issuer: statement.issuer }),
          ...(statement.accountLast4 === null ? {} : { cardLast4: statement.accountLast4 }),
          ...(sealed === null ? {} : { password: sealed }),
          updatedAt: new Date(),
        },
      });

    return { importId: created.id, duplicate: false };
  },
);
