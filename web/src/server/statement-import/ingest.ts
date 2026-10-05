import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { statementImports, statementSources, type StatementImportRow } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { assertOwnsAccountsAndFriends } from '@/server/helpers/account';

import { extractPdfLines, PdfPasswordError, type PdfLine } from './pdf/extract';
import { parseStatementLines } from './pdf/parse';
import { type ParsedCardStatement } from './pdf/types';
import { roundMoney } from './pdf/values';
import { openPassword, sealPassword } from './secrets';

const ROUNDING_SLACK = 1;
const DAY_MS = 86_400_000;
const ISO_DATE_LENGTH = 10;
const BREAKDOWN = /^INTEREST ON EMI/i;

export class StatementAccountRequiredError extends Error {
  constructor(
    readonly issuer: string,
    readonly cardLast4: string | null,
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

const movementRows = (statement: ParsedCardStatement): StatementImportRow[] => {
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

const movementOf = (rows: StatementImportRow[]) =>
  roundMoney(
    rows.reduce((sum, row) => sum + (row.direction === 'debit' ? row.amount : -row.amount), 0),
  );

const outstandingAtClose = (
  statement: ParsedCardStatement,
  movement: number,
  previousClosing: number | null,
) => {
  if (statement.totalDue === null) {
    return null;
  }
  for (const opening of [statement.previousBalance, previousClosing]) {
    if (opening !== null && Math.abs(opening + movement - statement.totalDue) < ROUNDING_SLACK) {
      return roundMoney(opening + movement);
    }
  }
  return statement.totalDue;
};

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
  statement: ParsedCardStatement,
) => {
  const sameIssuer = sources.filter((source) => source.issuer === statement.issuer);
  const exact = sameIssuer.filter(
    (source) => statement.cardLast4 !== null && source.cardLast4 === statement.cardLast4,
  );
  if (exact.length === 1) {
    return exact[0];
  }
  return sameIssuer.length === 1 ? sameIssuer[0] : undefined;
};

export const ingestStatementPdf = instrumentedFunction(
  'ingestStatementPdf',
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
    const attempts: Array<string | undefined> = hasInput ? [input.password] : [undefined, ...saved];
    let read: { lines: PdfLine[]; password: string | undefined };
    try {
      read = await readLines(input.data, attempts);
    } catch (error) {
      if (error instanceof PdfPasswordError) {
        throw new PdfPasswordError(!hasInput);
      }
      throw error;
    }

    const statement = parseStatementLines(read.lines);
    if (statement.periodStart === null || statement.periodEnd === null) {
      throw new Error('Could not read the statement period from this file');
    }

    const accountId = input.accountId ?? pickSource(sources, statement)?.accountId;
    if (accountId === undefined) {
      throw new StatementAccountRequiredError(statement.issuer, statement.cardLast4);
    }

    const rows = movementRows(statement);
    const movement = movementOf(rows);
    const previous = await db
      .select({ closingBalance: statementImports.closingBalance })
      .from(statementImports)
      .where(
        and(
          eq(statementImports.accountId, accountId),
          eq(statementImports.periodEnd, addDays(statement.periodStart, -1)),
        ),
      )
      .limit(1);
    const previousClosing = previous.at(0)?.closingBalance;
    const outstanding = outstandingAtClose(
      statement,
      movement,
      previousClosing === undefined || previousClosing === null ? null : -Number(previousClosing),
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
          periodStart: statement.periodStart,
          periodEnd: statement.periodEnd,
          statementDate: statement.statementDate,
          openingBalance: outstanding === null ? null : String(-roundMoney(outstanding - movement)),
          closingBalance: outstanding === null ? null : String(-outstanding),
          totalDue: statement.totalDue === null ? null : String(statement.totalDue),
          rows,
          summary: {
            dueDate: statement.dueDate,
            minimumDue: statement.minimumDue,
            creditLimit: statement.creditLimit,
            cardLast4: statement.cardLast4,
            declared: statement.declared,
            totals: statement.totals,
          },
        })
        .returning({ id: statementImports.id })
    ).at(0);
    if (created === undefined) {
      throw new Error('Could not save the statement');
    }

    const remember = input.rememberPassword && read.password !== undefined;
    const sealed = remember && read.password !== undefined ? sealPassword(read.password) : null;
    await db
      .insert(statementSources)
      .values({
        accountId,
        userId,
        issuer: statement.issuer,
        cardLast4: statement.cardLast4,
        password: sealed,
      })
      .onConflictDoUpdate({
        target: statementSources.accountId,
        set: {
          issuer: statement.issuer,
          ...(statement.cardLast4 === null ? {} : { cardLast4: statement.cardLast4 }),
          ...(sealed === null ? {} : { password: sealed }),
          updatedAt: new Date(),
        },
      });

    return { importId: created.id, duplicate: false };
  },
);
