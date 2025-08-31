import { and, eq, sql } from 'drizzle-orm';

import {
  bankAccount,
  friendsProfiles,
  selfTransferStatements,
  splits,
  statements,
} from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import type { Account, AccountSummary, friendSummary } from '@/types';

type AccountAggregationResult = {
  accountId: string | null;
  amount: number;
};

const getAccountSummary = (
  accounts: Account[],
  expenses: AccountAggregationResult[],
  outsideTransactions: AccountAggregationResult[],
  friendTransactions: AccountAggregationResult[],
  selfTransfers: AccountAggregationResult[],
) => {
  const accountSummary: AccountSummary[] = [];
  for (const account of accounts) {
    const accountExpenses = expenses.find((exp) => exp.accountId === account.id);
    const accountOutsideTransactions = outsideTransactions.find(
      (exp) => exp.accountId === account.id,
    );
    const friendTransaction = friendTransactions.find((exp) => exp.accountId === account.id);
    const selfTransfer = selfTransfers.find((exp) => exp.accountId === account.id);
    accountSummary.push({
      account: account,
      expenses: accountExpenses?.amount ?? 0,
      selfTransfers: selfTransfer?.amount ?? 0,
      outsideTransactions: accountOutsideTransactions?.amount ?? 0,
      friendTransactions: friendTransaction?.amount ?? 0,
      finalAmount: 0,
    });
  }
  return accountSummary.map((summary) => {
    const finalAmount =
      parseFloat(summary.account.startingBalance) -
      summary.expenses +
      summary.selfTransfers +
      summary.outsideTransactions +
      summary.friendTransactions;
    return {
      ...summary,
      finalAmount,
    };
  });
};

export const summaryRouter = createTRPCRouter({
  getAccountBalanceSummary: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await ctx.db
      .select()
      .from(bankAccount)
      .where(eq(bankAccount.userId, ctx.session.user.id))
      .orderBy(bankAccount.accountName);
    const expenses = await ctx.db
      .select({
        accountId: statements.accountId,
        amount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
      })
      .from(statements)
      .where(
        and(eq(statements.userId, ctx.session.user.id), eq(statements.statementKind, 'expense')),
      )
      .groupBy(statements.accountId);
    const outsideTransactions = await ctx.db
      .select({
        accountId: statements.accountId,
        amount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
      })
      .from(statements)
      .where(
        and(
          eq(statements.userId, ctx.session.user.id),
          eq(statements.statementKind, 'outside_transaction'),
        ),
      )
      .groupBy(statements.accountId);
    const friendTransactions = await ctx.db
      .select({
        accountId: statements.accountId,
        amount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
      })
      .from(statements)
      .where(
        and(
          eq(statements.userId, ctx.session.user.id),
          eq(statements.statementKind, 'friend_transaction'),
        ),
      )
      .groupBy(statements.accountId);
    const selfTransfers = (
      await ctx.db.execute<{ accountId: string; amount: string }>(sql`
      SELECT account_id AS "accountId", SUM(amount) AS amount
      FROM (
        SELECT "from_account_id" AS account_id, -amount AS amount
        FROM ${selfTransferStatements}
        WHERE user_id = ${ctx.session.user.id}
        UNION ALL
        SELECT "to_account_id" AS account_id, amount AS amount
        FROM ${selfTransferStatements}
        WHERE user_id = ${ctx.session.user.id}
      ) movements
      GROUP BY account_id
    `)
    ).rows.map((row) => {
      return {
        ...row,
        amount: parseFloat(row.amount),
      };
    });
    return getAccountSummary(
      accounts,
      expenses,
      outsideTransactions,
      friendTransactions,
      selfTransfers,
    );
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
