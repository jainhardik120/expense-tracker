import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';

import {
  bankAccount,
  friendsProfiles,
  selfTransferStatements,
  splits,
  statements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import type { AccountSummary, friendSummary } from '@/types';

const getSelfTransferAmount = (db: Database, userId: string, start?: Date, end?: Date) => {
  const conditions = [eq(selfTransferStatements.userId, userId)];
  if (start !== undefined) {
    conditions.push(gte(selfTransferStatements.createdAt, start));
  }
  if (end !== undefined) {
    conditions.push(lt(selfTransferStatements.createdAt, end));
  }
  const unionQuery = unionAll(
    db
      .select({
        accountId: selfTransferStatements.toAccountId,
        amount: sql<number>`${selfTransferStatements.amount}`.mapWith(Number).as('amount'),
      })
      .from(selfTransferStatements)
      .where(and(...conditions)),
    db
      .select({
        accountId: selfTransferStatements.fromAccountId,
        amount: sql<number>`-${selfTransferStatements.amount}`.mapWith(Number).as('amount'),
      })
      .from(selfTransferStatements)
      .where(and(...conditions)),
  ).as('union_query');
  return db
    .select({
      accountId: unionQuery.accountId,
      amount: sql<number>`COALESCE(SUM(${unionQuery.amount}), 0)`.mapWith(Number),
    })
    .from(unionQuery)
    .groupBy(unionQuery.accountId);
};

const getTransfersSummary = async (
  db: Database,
  accounts: string[],
  userId: string,
  start?: Date,
  end?: Date,
) => {
  const conditions = [eq(statements.userId, userId)];
  if (start !== undefined) {
    conditions.push(gte(statements.createdAt, start));
  }
  if (end !== undefined) {
    conditions.push(lt(statements.createdAt, end));
  }
  const expenses = await db
    .select({
      accountId: statements.accountId,
      amount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
      kind: statements.statementKind,
    })
    .from(statements)
    .where(and(...conditions))
    .groupBy(statements.accountId, statements.statementKind);
  const selfTransfers = await getSelfTransferAmount(db, userId);
  return accounts.map((id) => {
    const expense =
      expenses.find((exp) => exp.accountId === id && exp.kind === 'expense')?.amount ?? 0;
    const selfTransfer = selfTransfers.find((exp) => exp.accountId === id)?.amount ?? 0;
    const outsideTransaction =
      expenses.find((exp) => exp.accountId === id && exp.kind === 'outside_transaction')?.amount ??
      0;
    const friendTransaction =
      expenses.find((exp) => exp.accountId === id && exp.kind === 'friend_transaction')?.amount ??
      0;
    return {
      accountId: id,
      expenses: expense,
      selfTransfers: selfTransfer,
      outsideTransactions: outsideTransaction,
      friendTransactions: friendTransaction,
      totalTransfers: selfTransfer + outsideTransaction + friendTransaction - expense,
    };
  });
};

const getAccountsSummaryBetweenDates = async (
  db: Database,
  userId: string,
  start?: Date,
  end?: Date,
) => {
  const accounts = await db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.userId, userId))
    .orderBy(bankAccount.accountName);
  let initBalances: {
    accountId: string;
    startingBalance: number;
  }[] = accounts.map((account) => {
    return {
      accountId: account.id,
      startingBalance: parseFloat(account.startingBalance),
    };
  });
  if (start !== undefined) {
    const startingBalances = await getTransfersSummary(
      db,
      accounts.map((account) => account.id),
      userId,
      undefined,
      start,
    );
    const newBalances = initBalances.map((account) => {
      const transfers =
        startingBalances.find((transfer) => transfer.accountId === account.accountId)
          ?.totalTransfers ?? 0;
      return {
        ...account,
        startingBalance: account.startingBalance + transfers,
      };
    });
    initBalances = newBalances;
  }
  const getFinalBalances = await getTransfersSummary(
    db,
    accounts.map((account) => account.id),
    userId,
    start,
    end,
  );
  return accounts.map<AccountSummary>((account) => {
    const initBalance =
      initBalances.find((init) => init.accountId === account.id)?.startingBalance ?? 0;
    const accountSummary = getFinalBalances.find((summary) => summary.accountId === account.id) ?? {
      expenses: 0,
      selfTransfers: 0,
      outsideTransactions: 0,
      friendTransactions: 0,
      totalTransfers: 0,
    };
    return {
      account: account,
      ...accountSummary,
      finalAmount: initBalance + accountSummary.totalTransfers,
    };
  });
};

export const summaryRouter = createTRPCRouter({
  getAccountBalanceSummary: protectedProcedure.query(async ({ ctx }) => {
    return getAccountsSummaryBetweenDates(ctx.db, ctx.session.user.id);
  }),
  getFriendsBalanceSummary: protectedProcedure.query(async ({ ctx }) => {
    const friends = await ctx.db
      .select()
      .from(friendsProfiles)
      .where(eq(friendsProfiles.userId, ctx.session.user.id))
      .orderBy(friendsProfiles.name);
    const friendTransactions = await ctx.db
      .select({
        friendId: statements.friendId,
        amount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
      })
      .from(statements)
      .where(
        and(
          eq(statements.userId, ctx.session.user.id),
          eq(statements.statementKind, 'friend_transaction'),
        ),
      )
      .groupBy(statements.friendId);
    const friendExpenses = await ctx.db
      .select({
        friendId: statements.friendId,
        amount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
      })
      .from(statements)
      .where(
        and(eq(statements.userId, ctx.session.user.id), eq(statements.statementKind, 'expense')),
      )
      .groupBy(statements.friendId);
    const friendSplits = await ctx.db
      .select({
        friendId: splits.friendId,
        amount: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number),
      })
      .from(splits)
      .where(and(eq(splits.userId, ctx.session.user.id)))
      .groupBy(splits.friendId);
    const friendSummary: friendSummary[] = [];
    for (const friend of friends) {
      const friendExpense = friendExpenses.find((exp) => exp.friendId === friend.id)?.amount ?? 0;
      const friendSplit = friendSplits.find((exp) => exp.friendId === friend.id)?.amount ?? 0;
      const friendTransaction =
        friendTransactions.find((exp) => exp.friendId === friend.id)?.amount ?? 0;
      friendSummary.push({
        friend: friend,
        paidByFriend: friendExpense,
        splits: friendSplit,
        friendTransactions: friendTransaction,
        currentBalance: friendExpense - friendSplit + friendTransaction,
      });
    }
    return friendSummary;
  }),
});
