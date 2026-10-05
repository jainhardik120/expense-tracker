import { randomUUID } from 'node:crypto';

import { fromZonedTime } from 'date-fns-tz';
import { and, eq, inArray } from 'drizzle-orm';

import {
  selfTransferStatements,
  smsNotifications,
  statementImportLinks,
  statementImports,
  statements,
} from '@/db/schema';
import { withZonedDatePart } from '@/lib/date-part';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { assertOwnsAccountsAndFriends } from '@/server/helpers/account';

import {
  type AddKind,
  getImportReview,
  type ReviewLedgerRow,
  type ReviewSuggestion,
} from './review';

const PAISE = 100;

export const ISSUER_NAMES: Record<string, string> = {
  icici: 'ICICI',
  yes: 'YES BANK',
  indusind: 'IndusInd',
  sbi: 'SBI Card',
  axis: 'Axis Bank',
  axis_account: 'Axis Bank account',
  icici_account: 'ICICI Bank account',
  sheet: 'Spreadsheet',
};

export type ApplyDecision = {
  id: string;
  mode: 'new' | 'fold';
  statementKind: AddKind;
  category: string;
  tags: string[];
  counterpartyAccountId: string | null;
};

export type ApplyResult = {
  added: number;
  adjusted: number;
  redated: number;
};

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const paise = (value: number) => Math.round(value * PAISE);
const signed = (amount: number, direction: 'debit' | 'credit') =>
  direction === 'debit' ? -amount : amount;

const localMidnight = (date: string, timeZone: string) =>
  fromZonedTime(`${date}T00:00:00`, timeZone);

type Addition = Extract<ReviewSuggestion, { type: 'add' | 'add_difference' }>;

const insertAddition = async (
  tx: Tx,
  userId: string,
  accountId: string,
  addition: Addition,
  decision: ApplyDecision,
  createdAt: Date,
) => {
  if (decision.statementKind === 'self_transfer') {
    if (decision.counterpartyAccountId === null || decision.counterpartyAccountId === accountId) {
      throw new Error(`Pick the other account for "${addition.description}"`);
    }
    const incoming = addition.direction === 'credit';
    const inserted = await tx
      .insert(selfTransferStatements)
      .values({
        userId,
        fromAccountId: incoming ? decision.counterpartyAccountId : accountId,
        toAccountId: incoming ? accountId : decision.counterpartyAccountId,
        amount: addition.amount.toFixed(2),
        createdAt,
      })
      .returning({ id: selfTransferStatements.id });
    return { selfTransferId: inserted.at(0)?.id ?? null, statementId: null };
  }
  const category = decision.category.trim();
  if (category === '') {
    throw new Error(`Give "${addition.description}" a category`);
  }
  const value =
    decision.statementKind === 'expense'
      ? -signed(addition.amount, addition.direction)
      : signed(addition.amount, addition.direction);
  const inserted = await tx
    .insert(statements)
    .values({
      userId,
      accountId,
      amount: value.toFixed(2),
      category,
      tags: decision.tags,
      statementKind: decision.statementKind,
      createdAt,
    })
    .returning({ id: statements.id });
  return { statementId: inserted.at(0)?.id ?? null, selfTransferId: null };
};

const updateLedgerAmount = async (
  tx: Tx,
  userId: string,
  row: ReviewLedgerRow,
  deltaPaise: number,
) => {
  const next = paise(signed(row.amount, row.direction)) + deltaPaise;
  if (next === 0 || Math.sign(next) !== Math.sign(signed(row.amount, row.direction))) {
    throw new Error(`"${row.label}" on ${row.date} cannot absorb that change`);
  }
  const magnitude = Math.abs(next) / PAISE;
  if (row.source === 'self_transfer') {
    const current = (
      await tx
        .select({ amount: selfTransferStatements.amount })
        .from(selfTransferStatements)
        .where(
          and(eq(selfTransferStatements.id, row.id), eq(selfTransferStatements.userId, userId)),
        )
        .for('update')
    ).at(0);
    if (current === undefined || paise(Number(current.amount)) !== paise(row.amount)) {
      throw new Error('A transfer changed while you were reviewing — reload and try again');
    }
    await tx
      .update(selfTransferStatements)
      .set({ amount: magnitude.toFixed(2) })
      .where(eq(selfTransferStatements.id, row.id));
    return;
  }
  const current = (
    await tx
      .select({ amount: statements.amount, taxableAmount: statements.taxableAmount })
      .from(statements)
      .where(and(eq(statements.id, row.id), eq(statements.userId, userId)))
      .for('update')
  ).at(0);
  if (current === undefined || paise(Math.abs(Number(current.amount))) !== paise(row.amount)) {
    throw new Error('A statement changed while you were reviewing — reload and try again');
  }
  const stored = row.kind === 'expense' ? -next / PAISE : next / PAISE;
  let { taxableAmount } = current;
  if (taxableAmount !== null) {
    if (paise(Number(taxableAmount)) === paise(Number(current.amount))) {
      taxableAmount = stored.toFixed(2);
    } else if (stored <= 0 || Number(taxableAmount) > stored) {
      taxableAmount = null;
    }
  }
  await tx
    .update(statements)
    .set({ amount: stored.toFixed(2), taxableAmount })
    .where(eq(statements.id, row.id));
};

const localDate = (date: string) => {
  const parts = date.split('-').map(Number);
  return new Date(parts.at(0) ?? 0, (parts.at(1) ?? 1) - 1, parts.at(2) ?? 1);
};

const redateLedger = async (
  tx: Tx,
  userId: string,
  row: ReviewLedgerRow,
  date: string,
  timeZone: string,
) => {
  const table = row.source === 'self_transfer' ? selfTransferStatements : statements;
  const current = (
    await tx
      .select({ createdAt: table.createdAt })
      .from(table)
      .where(and(eq(table.id, row.id), eq(table.userId, userId)))
      .for('update')
  ).at(0);
  if (current === undefined) {
    throw new Error(`"${row.label}" no longer exists — reload and try again`);
  }
  const picked = localDate(date);
  await tx
    .update(table)
    .set({ createdAt: withZonedDatePart(current.createdAt, picked, timeZone) })
    .where(eq(table.id, row.id));
};

const linkFor = (key: string) =>
  key.startsWith('t:')
    ? { statementId: null, selfTransferId: key.slice(2) }
    : { statementId: key.slice(2), selfTransferId: null };

export const applyImport = instrumentedFunction(
  'applyImport',
  async (
    db: Database,
    userId: string,
    importId: string,
    decisions: ApplyDecision[],
    timeZone: string,
    finish: boolean,
  ): Promise<ApplyResult> => {
    const review = await getImportReview(db, userId, importId, timeZone);
    if (review.import.status !== 'review') {
      throw new Error('This statement has already been handled');
    }
    if (!finish && decisions.length === 0) {
      throw new Error('Select at least one change to apply');
    }
    if (finish && review.blockedBy !== null) {
      throw new Error(
        `Apply the earlier statements for this account first, starting with ${review.blockedBy.periodStart} to ${review.blockedBy.periodEnd}, so rows are not counted twice`,
      );
    }
    const suggestionById = new Map(
      review.suggestions.map((suggestion) => [suggestion.id, suggestion]),
    );
    const accepted = decisions.map((decision) => {
      const suggestion = suggestionById.get(decision.id);
      if (suggestion === undefined) {
        throw new Error('The statement or your ledger changed since you opened it — reload');
      }
      return { decision, suggestion };
    });
    await assertOwnsAccountsAndFriends(db, userId, {
      accountIds: accepted.map(({ decision }) => decision.counterpartyAccountId),
    });

    const { accountId } = review.import;
    const { ledger } = review;
    const smsIds = accepted.flatMap(({ suggestion }) =>
      suggestion.type === 'add' && suggestion.smsId !== null ? [suggestion.smsId] : [],
    );

    return db.transaction(async (tx) => {
      const smsTimes = new Map(
        smsIds.length === 0
          ? []
          : (
              await tx
                .select({ id: smsNotifications.id, createdAt: smsNotifications.createdAt })
                .from(smsNotifications)
                .where(
                  and(
                    eq(smsNotifications.userId, userId),
                    eq(smsNotifications.status, 'pending'),
                    inArray(smsNotifications.id, smsIds),
                  ),
                )
                .for('update')
            ).map((row) => [row.id, row.createdAt]),
      );

      const links = new Map<
        string,
        { statementId: string | null; selfTransferId: string | null }
      >();
      for (const group of review.groups) {
        for (const key of group.ledger) {
          links.set(key, linkFor(key));
        }
      }

      const deltas = new Map<string, number>();
      let added = 0;
      let redated = 0;
      for (const { decision, suggestion } of accepted) {
        if (suggestion.type === 'adjust') {
          const row = ledger[suggestion.ledger];
          if (row === undefined) {
            continue;
          }
          deltas.set(
            row.key,
            (deltas.get(row.key) ?? 0) +
              paise(signed(suggestion.to, row.direction)) -
              paise(signed(suggestion.from, row.direction)),
          );
          continue;
        }
        if (suggestion.type === 'redate') {
          const row = ledger[suggestion.ledger];
          if (row !== undefined) {
            await redateLedger(tx, userId, row, suggestion.to, timeZone);
            links.set(row.key, linkFor(row.key));
            redated += 1;
          }
          continue;
        }
        if (suggestion.type === 'not_on_statement') {
          continue;
        }
        if (decision.mode === 'fold' && suggestion.foldInto !== null) {
          deltas.set(
            suggestion.foldInto,
            (deltas.get(suggestion.foldInto) ?? 0) +
              paise(signed(suggestion.amount, suggestion.direction)),
          );
          links.set(suggestion.foldInto, linkFor(suggestion.foldInto));
          continue;
        }
        const smsTime = suggestion.smsId === null ? undefined : smsTimes.get(suggestion.smsId);
        const createdAt =
          smsTime === undefined
            ? localMidnight(suggestion.date, timeZone)
            : withZonedDatePart(smsTime, localDate(suggestion.date), timeZone);
        const created = await insertAddition(
          tx,
          userId,
          accountId,
          suggestion,
          decision,
          createdAt,
        );
        const id = created.statementId ?? created.selfTransferId;
        if (id !== null) {
          links.set(randomUUID(), created);
        }
        if (smsTime !== undefined && suggestion.smsId !== null && id !== null) {
          await tx
            .update(smsNotifications)
            .set({ status: 'inserted', additionalAttributes: { statementId: id } })
            .where(eq(smsNotifications.id, suggestion.smsId));
        }
        added += 1;
      }

      for (const [key, delta] of deltas) {
        const row = ledger[key];
        if (row === undefined || delta === 0) {
          continue;
        }
        await updateLedgerAmount(tx, userId, row, delta);
        links.set(key, linkFor(key));
      }

      const result = {
        added,
        adjusted: [...deltas.values()].filter((delta) => delta !== 0).length,
        redated,
      };
      if (!finish) {
        return result;
      }

      if (links.size > 0) {
        await tx
          .insert(statementImportLinks)
          .values([...links.values()].map((link) => ({ importId, ...link })));
      }

      await tx
        .update(statementImports)
        .set({
          status: 'applied',
          appliedAt: new Date(),
          outcome: {
            matches: review.groups.map((group) => ({ rows: group.rows, ledger: group.ledger })),
            ...result,
          },
        })
        .where(eq(statementImports.id, importId));

      return result;
    });
  },
);
