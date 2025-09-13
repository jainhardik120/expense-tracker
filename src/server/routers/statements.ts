import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { selfTransferStatements, splits, statements } from '@/db/schema';
import {
  getMergedStatements,
  getRowsCount,
  getStartingBalancesPaginated,
  getStatementAmountAndSplits,
} from '@/server/helpers/statements';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  createSelfTransferSchema,
  createSplitSchema,
  createStatementSchema,
  type SelfTransferStatement,
  type Statement,
  statementParserSchema,
} from '@/types';

const getChangeForAccount = (accountId: string, statement: Statement | SelfTransferStatement) => {
  if ('accountId' in statement && statement.accountId === accountId) {
    let change = 0;
    if (statement.statementKind === 'expense') {
      change = -1 * parseFloat(statement.amount);
    }
    if (
      statement.statementKind === 'friend_transaction' ||
      statement.statementKind === 'outside_transaction'
    ) {
      change = parseFloat(statement.amount);
    }
    return change;
  }
  if ('fromAccountId' in statement && 'toAccountId' in statement) {
    if (statement.fromAccountId === accountId) {
      return -1 * parseFloat(statement.amount);
    }
    if (statement.toAccountId === accountId) {
      return parseFloat(statement.amount);
    }
  }
  return 0;
};

const getChangeForFriend = (
  friendId: string,
  statement: Statement | SelfTransferStatement,
  splitTotals: { statementId: string; total: number }[],
) => {
  const splitAmount =
    -1 * (splitTotals.find((split) => split.statementId === statement.id)?.total ?? 0);
  if (
    'friendId' in statement &&
    statement.friendId === friendId &&
    (statement.statementKind === 'expense' || statement.statementKind === 'friend_transaction')
  ) {
    return splitAmount + parseFloat(statement.amount);
  }
  return splitAmount;
};

export const statementsRouter = createTRPCRouter({
  getStatements: protectedProcedure.input(statementParserSchema).query(async ({ ctx, input }) => {
    let summary = null;
    let startingBalance = 0;
    let splitTotal: {
      statementId: string;
      total: number;
    }[] = [];
    const rawStatements = await getMergedStatements(ctx.db, ctx.session.user.id, input);
    if (input.account.length === 1) {
      const accountId = input.account[0];
      summary = await getStartingBalancesPaginated(ctx.db, ctx.session.user.id, {
        ...input,
        account: accountId,
      });
      startingBalance = summary.finalBalance;
      if ('friend' in summary) {
        splitTotal = await ctx.db
          .select({
            total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number),
            statementId: splits.statementId,
          })
          .from(splits)
          .where(
            and(
              eq(splits.friendId, accountId),
              inArray(
                splits.statementId,
                rawStatements.map((s) => s.id),
              ),
            ),
          )
          .groupBy(splits.statementId);
      }
    }
    const statements = rawStatements
      .toReversed()
      .map((statement) => {
        if (summary === null) {
          return statement;
        }
        if ('account' in summary && input.account[0] === summary.account.id) {
          const accountId = input.account[0];
          const change = getChangeForAccount(accountId, statement);
          startingBalance += change;
          return {
            ...statement,
            finalBalance: startingBalance,
          };
        }
        if ('friend' in summary && input.account[0] === summary.friend.id) {
          const friendId = input.account[0];
          const change = getChangeForFriend(friendId, statement, splitTotal);
          startingBalance += change;
          return {
            ...statement,
            finalBalance: startingBalance,
          };
        }
        return statement;
      })
      .reverse();
    const rowsCount = await getRowsCount(ctx.db, ctx.session.user.id, input);
    const pageCount = Math.ceil(
      (rowsCount.statementCount + rowsCount.selfTransferStatementCount) / input.perPage,
    );
    return {
      summary,
      statements,
      pageCount,
      rowsCount,
    };
  }),
  addStatement: protectedProcedure.input(createStatementSchema).mutation(({ ctx, input }) => {
    return ctx.db
      .insert(statements)
      .values({
        userId: ctx.session.user.id,
        ...input,
        accountId: input.accountId === undefined || input.accountId === '' ? null : input.accountId,
        friendId: input.friendId === undefined || input.friendId === '' ? null : input.friendId,
      })
      .returning({ id: statements.id });
  }),
  updateStatement: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        createStatementSchema,
      }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db
        .update(statements)
        .set({
          ...input.createStatementSchema,
          accountId:
            input.createStatementSchema.accountId === undefined ||
            input.createStatementSchema.accountId === ''
              ? null
              : input.createStatementSchema.accountId,
          friendId:
            input.createStatementSchema.friendId === undefined ||
            input.createStatementSchema.friendId === ''
              ? null
              : input.createStatementSchema.friendId,
        })
        .where(and(eq(statements.id, input.id), eq(statements.userId, ctx.session.user.id)))
        .returning({ id: statements.id });
    }),
  deleteStatement: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(statements)
        .where(and(eq(statements.id, input.id), eq(statements.userId, ctx.session.user.id)));
    }),
  addSelfTransferStatement: protectedProcedure
    .input(createSelfTransferSchema)
    .mutation(({ ctx, input }) => {
      return ctx.db
        .insert(selfTransferStatements)
        .values({
          userId: ctx.session.user.id,
          ...input,
        })
        .returning({ id: statements.id });
    }),
  updateSelfTransferStatement: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        createSelfTransferSchema,
      }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db
        .update(selfTransferStatements)
        .set(input.createSelfTransferSchema)
        .where(
          and(
            eq(selfTransferStatements.id, input.id),
            eq(selfTransferStatements.userId, ctx.session.user.id),
          ),
        )
        .returning({ id: selfTransferStatements.id });
    }),
  deleteSelfTransferStatement: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(selfTransferStatements)
        .where(
          and(
            eq(selfTransferStatements.id, input.id),
            eq(selfTransferStatements.userId, ctx.session.user.id),
          ),
        );
    }),
  getStatementSplits: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db
        .select()
        .from(splits)
        .where(and(eq(splits.statementId, input.id), eq(splits.userId, ctx.session.user.id)));
    }),
  addStatementSplit: protectedProcedure
    .input(
      z.object({
        statementId: z.string(),
        createSplitSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { statementAmount, totalAllocated, kind } = await getStatementAmountAndSplits(
        ctx.db,
        input.statementId,
        '',
      );
      if (kind !== 'expense') {
        throw new Error('Cannot add split. Statement is not an expense.');
      }
      const newSplitAmount = parseFloat(input.createSplitSchema.amount);
      if (totalAllocated + newSplitAmount > statementAmount) {
        throw new Error(
          `Cannot add split. Total allocated amount (${totalAllocated + newSplitAmount}) would exceed statement amount (${statementAmount}).`,
        );
      }
      return ctx.db
        .insert(splits)
        .values({
          userId: ctx.session.user.id,
          statementId: input.statementId,
          ...input.createSplitSchema,
        })
        .returning({ id: splits.id });
    }),
  deleteStatementSplit: protectedProcedure
    .input(
      z.object({
        splitId: z.string(),
      }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(splits)
        .where(and(eq(splits.id, input.splitId), eq(splits.userId, ctx.session.user.id)));
    }),
  updateStatementSplit: protectedProcedure
    .input(
      z.object({
        splitId: z.string(),
        createSplitSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const currentSplit = await ctx.db
        .select()
        .from(splits)
        .where(and(eq(splits.id, input.splitId), eq(splits.userId, ctx.session.user.id)));
      if (currentSplit.length === 0) {
        throw new Error('Split not found');
      }
      const currentSplitAmount = parseFloat(currentSplit[0].amount);
      const { statementId } = currentSplit[0];
      const { statementAmount, totalAllocated } = await getStatementAmountAndSplits(
        ctx.db,
        statementId,
        input.splitId,
      );
      if (totalAllocated + parseFloat(input.createSplitSchema.amount) > statementAmount) {
        throw new Error(
          `Cannot update split. Total allocated amount (${totalAllocated + currentSplitAmount}) would exceed statement amount (${statementAmount}).`,
        );
      }
      return ctx.db
        .update(splits)
        .set({
          ...input.createSplitSchema,
        })
        .where(and(eq(splits.id, input.splitId), eq(splits.userId, ctx.session.user.id)));
    }),
});
