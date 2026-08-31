import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';

import {
  bankAccount,
  friendsProfiles,
  investments,
  reportBoundaries,
  selfTransferStatements,
  splits,
  statements,
} from '@/db/schema';
import type { Database } from '@/lib/db';
import { parseFloatSafe } from '@/server/helpers/emi-calculations';

/**
 * What a report is handed: raw rows, not metrics.
 *
 * Every judgement about what a row *means* — which category is rent, which tag
 * marks a one-off, how expenditure is derived — belongs in the template's code
 * step, where it is per-user and editable. So this stays deliberately dumb: it
 * resolves foreign keys to names (the sandbox cannot join) and buckets rows into
 * periods (it cannot see the boundaries either), and computes nothing else.
 */
export const reportInputSchema = z.object({
  generatedAt: z.string(),
  currency: z.string(),
  periods: z.array(
    z.object({
      index: z.number(),
      start: z.string(),
      end: z.string(),
      label: z.string(),
      note: z.string(),
    }),
  ),
  statements: z.array(
    z.object({
      periodIndex: z.number(),
      date: z.string(),
      amount: z.number(),
      category: z.string(),
      kind: z.string(),
      account: z.string(),
      friend: z.string(),
      tags: z.array(z.string()),
      splitAmount: z.number(),
    }),
  ),
  selfTransfers: z.array(
    z.object({
      periodIndex: z.number(),
      date: z.string(),
      amount: z.number(),
      fromAccount: z.string(),
      toAccount: z.string(),
    }),
  ),
  investments: z.array(
    z.object({
      periodIndex: z.number(),
      date: z.string(),
      kind: z.string(),
      instrument: z.string(),
      amount: z.number(),
    }),
  ),
  accounts: z.array(z.object({ name: z.string(), startingBalance: z.number() })),
  friends: z.array(z.object({ name: z.string() })),
  // Where things stood the instant the reported span opens, split the way the
  // app's own balance figure is: what the accounts hold, and what friends owe.
  // "My balance" is the difference of the two, so a report cannot reproduce the
  // number shown on the reports page without both legs kept apart.
  openingAccountsBalance: z.number(),
  openingFriendsBalance: z.number(),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

const periodIndexFor = (date: Date, starts: number[]) => {
  const time = date.getTime();
  let index = -1;
  for (let i = 0; i < starts.length; i++) {
    if (time >= starts[i]) {
      index = i;
    }
  }
  return index;
};

export const buildReportInput = async ({
  db,
  userId,
  fromBoundaryId,
  toBoundaryId,
  timezone,
}: {
  db: Database;
  userId: string;
  fromBoundaryId: string;
  toBoundaryId: string;
  timezone: string;
}): Promise<ReportInput> => {
  const boundaries = await db
    .select()
    .from(reportBoundaries)
    .where(eq(reportBoundaries.userId, userId))
    .orderBy(asc(reportBoundaries.boundaryDate));

  const fromIndex = boundaries.findIndex((boundary) => boundary.id === fromBoundaryId);
  const toIndex = boundaries.findIndex((boundary) => boundary.id === toBoundaryId);
  if (fromIndex === -1 || toIndex === -1) {
    throw new Error('Unknown report boundary');
  }
  if (toIndex <= fromIndex) {
    throw new Error('The end boundary must come after the start boundary');
  }

  const selected = boundaries.slice(fromIndex, toIndex + 1);
  const spanStart = selected[0].boundaryDate;
  const spanEnd = selected[selected.length - 1].boundaryDate;

  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // A period runs from one boundary to the next, so N boundaries give N-1 periods
  // and the closing boundary contributes only its end date.
  const periods = selected.slice(0, -1).map((boundary, index) => {
    const end = selected[index + 1].boundaryDate;
    return {
      index,
      start: boundary.boundaryDate.toISOString(),
      end: end.toISOString(),
      label: `${formatter.format(boundary.boundaryDate)} – ${formatter.format(end)}`,
      note: boundary.note ?? '',
    };
  });
  const periodStarts = periods.map((period) => new Date(period.start).getTime());

  const [accountRows, friendRows, statementRows, selfTransferRows, investmentRows, splitRows] =
    await Promise.all([
      db.select().from(bankAccount).where(eq(bankAccount.userId, userId)),
      db.select().from(friendsProfiles).where(eq(friendsProfiles.userId, userId)),
      db
        .select()
        .from(statements)
        .where(
          and(
            eq(statements.userId, userId),
            gte(statements.createdAt, spanStart),
            lt(statements.createdAt, spanEnd),
          ),
        )
        .orderBy(asc(statements.createdAt)),
      db
        .select()
        .from(selfTransferStatements)
        .where(
          and(
            eq(selfTransferStatements.userId, userId),
            gte(selfTransferStatements.createdAt, spanStart),
            lt(selfTransferStatements.createdAt, spanEnd),
          ),
        )
        .orderBy(asc(selfTransferStatements.createdAt)),
      db
        .select()
        .from(investments)
        .where(
          and(
            eq(investments.userId, userId),
            gte(investments.investmentDate, spanStart),
            lt(investments.investmentDate, spanEnd),
          ),
        )
        .orderBy(asc(investments.investmentDate)),
      db.select().from(splits).where(eq(splits.userId, userId)),
    ]);

  const accountName = new Map(accountRows.map((row) => [row.id, row.accountName]));
  const friendName = new Map(friendRows.map((row) => [row.id, row.name]));

  const splitTotalByStatement = new Map<string, number>();
  for (const split of splitRows) {
    splitTotalByStatement.set(
      split.statementId,
      (splitTotalByStatement.get(split.statementId) ?? 0) + parseFloatSafe(split.amount),
    );
  }

  // Everything before the span, to seed the balances the periods then move.
  const priorRows = await db
    .select({
      id: statements.id,
      amount: statements.amount,
      statementKind: statements.statementKind,
      accountId: statements.accountId,
      friendId: statements.friendId,
    })
    .from(statements)
    .where(and(eq(statements.userId, userId), lt(statements.createdAt, spanStart)));
  const startingTotal = accountRows.reduce(
    (total, row) => total + parseFloatSafe(row.startingBalance),
    0,
  );

  // Mirrors the app's own aggregation: an account moves on rows carrying an
  // account, a friend balance on rows carrying a friend, and a row can be both.
  // Splits on statements from before the span only — `splitRows` covers all time.
  const priorIds = new Set(priorRows.map((row) => row.id));
  const priorSplitTotal = splitRows.reduce(
    (total, split) =>
      priorIds.has(split.statementId) ? total + parseFloatSafe(split.amount) : total,
    0,
  );

  const accountSide = priorRows.reduce((total, row) => {
    if (row.accountId === null) {
      return total;
    }
    const amount = parseFloatSafe(row.amount);
    return row.statementKind === 'expense' ? total - amount : total + amount;
  }, 0);
  // A friend balance rises both when they pay for you and when a friend
  // transaction is recorded, so every row carrying a friend adds; the splits they
  // owe you are taken off below.
  const friendSide = priorRows.reduce(
    (total, row) => (row.friendId === null ? total : total + parseFloatSafe(row.amount)),
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    currency: 'INR',
    periods,
    statements: statementRows.map((row) => ({
      periodIndex: periodIndexFor(row.createdAt, periodStarts),
      date: row.createdAt.toISOString(),
      amount: parseFloatSafe(row.amount),
      category: row.category,
      kind: row.statementKind,
      account: row.accountId === null ? '' : (accountName.get(row.accountId) ?? ''),
      friend: row.friendId === null ? '' : (friendName.get(row.friendId) ?? ''),
      tags: row.tags,
      splitAmount: splitTotalByStatement.get(row.id) ?? 0,
    })),
    selfTransfers: selfTransferRows.map((row) => ({
      periodIndex: periodIndexFor(row.createdAt, periodStarts),
      date: row.createdAt.toISOString(),
      amount: parseFloatSafe(row.amount),
      fromAccount: accountName.get(row.fromAccountId) ?? '',
      toAccount: accountName.get(row.toAccountId) ?? '',
    })),
    investments: investmentRows.map((row) => ({
      periodIndex: periodIndexFor(row.investmentDate, periodStarts),
      date: row.investmentDate.toISOString(),
      kind: row.investmentKind,
      instrument: row.instrumentCode ?? '',
      amount: parseFloatSafe(row.investmentAmount),
    })),
    accounts: accountRows.map((row) => ({
      name: row.accountName,
      startingBalance: parseFloatSafe(row.startingBalance),
    })),
    friends: friendRows.map((row) => ({ name: row.name })),
    openingAccountsBalance: startingTotal + accountSide,
    openingFriendsBalance: friendSide - priorSplitTotal,
  };
};
