import { and, asc, desc, eq, getTableColumns, gte, lt, sql } from 'drizzle-orm';
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
import { localWallClock } from '@/lib/date';
import type { Database } from '@/lib/db';
import { parseFloatSafe } from '@/server/helpers/emi-calculations';

export const reportInputSchema = z.object({
  generatedAt: z.string(),
  currency: z.string(),
  periods: z.array(
    z.object({
      index: z.number(),
      start: z.string(),
      end: z.string(),
      label: z.string(),
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

  const periods = selected.slice(0, -1).map((boundary, index) => {
    const end = selected[index + 1].boundaryDate;
    return {
      index,
      start: boundary.boundaryDate.toISOString(),
      end: end.toISOString(),
      label: `${formatter.format(boundary.boundaryDate)} – ${formatter.format(end)}`,
    };
  });
  const periodStarts = periods.map((period) => new Date(period.start).getTime());

  const owedByStatement = db
    .select({
      statementId: splits.statementId,
      owed: sql<string>`sum(${splits.amount})`.as('owed'),
    })
    .from(splits)
    .where(eq(splits.userId, userId))
    .groupBy(splits.statementId)
    .as('owed_by_statement');

  const [accountRows, friendRows, statementRows, selfTransferRows, investmentRows, [prior]] =
    await Promise.all([
      db.select().from(bankAccount).where(eq(bankAccount.userId, userId)),
      db.select().from(friendsProfiles).where(eq(friendsProfiles.userId, userId)),
      db
        .select({
          ...getTableColumns(statements),
          owed: sql<string | null>`${owedByStatement.owed}`,
        })
        .from(statements)
        .leftJoin(owedByStatement, eq(owedByStatement.statementId, statements.id))
        .where(
          and(
            eq(statements.userId, userId),
            gte(statements.createdAt, spanStart),
            lt(statements.createdAt, spanEnd),
          ),
        )
        .orderBy(asc(statements.createdAt), desc(statements.id)),
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
      db
        .select({
          accountSide: sql<string>`coalesce(sum(case when ${statements.accountId} is null then 0 when ${statements.statementKind} = 'expense' then -${statements.amount} else ${statements.amount} end), 0)`,
          friendSide: sql<string>`coalesce(sum(case when ${statements.friendId} is null then 0 else ${statements.amount} end), 0)`,
          splitSide: sql<string>`coalesce((
            select sum(p.amount) from splits p join statements s on s.id = p.statement_id
            where p.user_id = ${userId} and s.user_id = ${userId} and s.created_at < ${spanStart}
          ), 0)`,
        })
        .from(statements)
        .where(and(eq(statements.userId, userId), lt(statements.createdAt, spanStart))),
    ]);

  const accountName = new Map(accountRows.map((row) => [row.id, row.accountName]));
  const friendName = new Map(friendRows.map((row) => [row.id, row.name]));

  const startingTotal = accountRows.reduce(
    (total, row) => total + parseFloatSafe(row.startingBalance),
    0,
  );
  const accountSide = Number(prior.accountSide);
  const friendSide = Number(prior.friendSide);
  const priorSplitTotal = Number(prior.splitSide);

  return {
    generatedAt: localWallClock(new Date(), timezone),
    currency: 'INR',
    periods,
    statements: statementRows.map((row) => ({
      periodIndex: periodIndexFor(row.createdAt, periodStarts),
      date: localWallClock(row.createdAt, timezone),
      amount: parseFloatSafe(row.amount),
      category: row.category,
      kind: row.statementKind,
      account: row.accountId === null ? '' : (accountName.get(row.accountId) ?? ''),
      friend: row.friendId === null ? '' : (friendName.get(row.friendId) ?? ''),
      tags: row.tags,
      splitAmount: Number(row.owed ?? 0),
    })),
    selfTransfers: selfTransferRows.map((row) => ({
      periodIndex: periodIndexFor(row.createdAt, periodStarts),
      date: localWallClock(row.createdAt, timezone),
      amount: parseFloatSafe(row.amount),
      fromAccount: accountName.get(row.fromAccountId) ?? '',
      toAccount: accountName.get(row.toAccountId) ?? '',
    })),
    investments: investmentRows.map((row) => ({
      periodIndex: periodIndexFor(row.investmentDate, periodStarts),
      date: localWallClock(row.investmentDate, timezone),
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
