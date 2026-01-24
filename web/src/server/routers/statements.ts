import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { selfTransferStatements, splits, statements } from '@/db/schema';
import {
  accountBelongToUser,
  friendBelongToUser,
  getMergedStatements,
  getRowsCount,
  getStatementAmountAndSplits,
  mergeRawStatementsWithSummary,
} from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  bulkSplitSchema,
  createSelfTransferSchema,
  createSplitSchema,
  createStatementSchema,
  ONE_HUNDRED_PERCENTAGE,
  statementParserSchema,
} from '@/types';

const ACCOUNT_NOT_FOUND_ERROR = 'Account not found';
const FRIEND_NOT_FOUND_ERROR = 'Friend not found';

export const statementsRouter = createTRPCRouter({
  getCategories: protectedProcedure.query(async ({ ctx }) => {
    return (
      await ctx.db
        .selectDistinct({ category: statements.category })
        .from(statements)
        .where(eq(statements.userId, ctx.user.id))
    )
      .map((c) => c.category)
      .sort((a, b) => a.localeCompare(b));
  }),
  getTags: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .selectDistinct({ tag: sql<string>`unnest(${statements.tags})`.as('tag') })
      .from(statements)
      .where(eq(statements.userId, ctx.user.id))
      .orderBy(sql<string>`tag`);
    return result.map((r) => r.tag).sort((a, b) => a.localeCompare(b));
  }),
  getStatements: protectedProcedure.input(statementParserSchema).query(async ({ ctx, input }) => {
    let statements = await getMergedStatements(ctx.db, ctx.user.id, input);
    let summary = null;
    if (
      input.account.length === 1 &&
      input.category.length === 0 &&
      input.statementKind.length === 0 &&
      input.tags.length === 0
    ) {
      const accountId = input.account[0];
      const { summary: accountSummary, statements: accountStatements } =
        await mergeRawStatementsWithSummary(ctx.db, ctx.user.id, accountId, statements, input);
      summary = accountSummary;
      statements = accountStatements;
    }
    const rowsCount = await getRowsCount(ctx.db, ctx.user.id, input);
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
  addStatement: protectedProcedure.input(createStatementSchema).mutation(async ({ ctx, input }) => {
    if (
      input.accountId !== undefined &&
      input.accountId !== '' &&
      !(await accountBelongToUser(input.accountId, ctx.user.id, ctx.db))
    ) {
      throw new Error(ACCOUNT_NOT_FOUND_ERROR);
    }
    if (
      input.friendId !== undefined &&
      input.friendId !== '' &&
      !(await friendBelongToUser(input.friendId, ctx.user.id, ctx.db))
    ) {
      throw new Error(FRIEND_NOT_FOUND_ERROR);
    }
    return ctx.db
      .insert(statements)
      .values({
        userId: ctx.user.id,
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
    .mutation(async ({ ctx, input }) => {
      if (
        input.createStatementSchema.accountId !== undefined &&
        input.createStatementSchema.accountId !== '' &&
        !(await accountBelongToUser(input.createStatementSchema.accountId, ctx.user.id, ctx.db))
      ) {
        throw new Error(ACCOUNT_NOT_FOUND_ERROR);
      }
      if (
        input.createStatementSchema.friendId !== undefined &&
        input.createStatementSchema.friendId !== '' &&
        !(await friendBelongToUser(input.createStatementSchema.friendId, ctx.user.id, ctx.db))
      ) {
        throw new Error(FRIEND_NOT_FOUND_ERROR);
      }
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
        .where(and(eq(statements.id, input.id), eq(statements.userId, ctx.user.id)))
        .returning({ id: statements.id });
    }),
  deleteStatement: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(statements)
        .where(and(eq(statements.id, input.id), eq(statements.userId, ctx.user.id)));
    }),
  addSelfTransferStatement: protectedProcedure
    .input(createSelfTransferSchema)
    .mutation(async ({ ctx, input }) => {
      if (
        !(await accountBelongToUser(input.fromAccountId, ctx.user.id, ctx.db)) ||
        !(await accountBelongToUser(input.toAccountId, ctx.user.id, ctx.db))
      ) {
        throw new Error(ACCOUNT_NOT_FOUND_ERROR);
      }
      return ctx.db
        .insert(selfTransferStatements)
        .values({
          userId: ctx.user.id,
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
    .mutation(async ({ ctx, input }) => {
      if (
        !(await accountBelongToUser(
          input.createSelfTransferSchema.fromAccountId,
          ctx.user.id,
          ctx.db,
        )) ||
        !(await accountBelongToUser(
          input.createSelfTransferSchema.toAccountId,
          ctx.user.id,
          ctx.db,
        ))
      ) {
        throw new Error(ACCOUNT_NOT_FOUND_ERROR);
      }
      return ctx.db
        .update(selfTransferStatements)
        .set(input.createSelfTransferSchema)
        .where(
          and(
            eq(selfTransferStatements.id, input.id),
            eq(selfTransferStatements.userId, ctx.user.id),
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
            eq(selfTransferStatements.userId, ctx.user.id),
          ),
        );
    }),
  getStatementSplits: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db
        .select()
        .from(splits)
        .where(and(eq(splits.statementId, input.id), eq(splits.userId, ctx.user.id)));
    }),
  addBulkStatementSplits: protectedProcedure
    .input(
      z.object({
        statementIds: z.array(z.string()),
        bulkSplitSchema: bulkSplitSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const splitTotals = db.$with('split_totals').as(
        db
          .select({
            statementId: splits.statementId,
            total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number).as('total'),
          })
          .from(splits)
          .groupBy(splits.statementId),
      );
      const rawStatements = await db
        .with(splitTotals)
        .select({
          id: statements.id,
          splitAmount: splitTotals.total,
          amount: statements.amount,
        })
        .from(statements)
        .where(
          and(
            eq(statements.userId, ctx.user.id),
            inArray(statements.id, input.statementIds),
            eq(statements.statementKind, 'expense'),
          ),
        )
        .leftJoin(splitTotals, eq(statements.id, splitTotals.statementId));
      if (rawStatements.length !== input.statementIds.length) {
        throw new Error('One or more statements not found or are not expenses.');
      }
      const maxPercentages = rawStatements.map((stmt) => {
        const amount = Number.parseFloat(stmt.amount);
        return ONE_HUNDRED_PERCENTAGE - (stmt.splitAmount / amount) * ONE_HUNDRED_PERCENTAGE;
      });
      const maxAllowedPercentage = Math.min(...maxPercentages);
      if (parseFloat(input.bulkSplitSchema.percentage) > maxAllowedPercentage) {
        throw new Error(
          `Cannot add bulk splits. The maximum allowed percentage is ${maxAllowedPercentage.toFixed(
            2,
          )}%.`,
        );
      }
      const existingSplits = await db
        .select({ id: splits.id })
        .from(splits)
        .where(
          and(
            inArray(splits.statementId, input.statementIds),
            eq(splits.userId, ctx.user.id),
            eq(splits.friendId, input.bulkSplitSchema.friendId),
          ),
        );
      if (existingSplits.length > 0) {
        throw new Error('One or more splits already exist for the selected friend.');
      }
      const inserts = rawStatements.map((stmt) => {
        const amount = Number.parseFloat(stmt.amount);
        const splitAmount = (
          (parseFloat(input.bulkSplitSchema.percentage) / ONE_HUNDRED_PERCENTAGE) *
          amount
        ).toFixed(2);
        return {
          userId: ctx.user.id,
          statementId: stmt.id,
          friendId: input.bulkSplitSchema.friendId,
          amount: splitAmount,
        };
      });
      await ctx.db.insert(splits).values(inserts);
    }),
  addStatementSplit: protectedProcedure
    .input(
      z.object({
        statementId: z.string(),
        createSplitSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await friendBelongToUser(input.createSplitSchema.friendId, ctx.user.id, ctx.db))) {
        throw new Error(FRIEND_NOT_FOUND_ERROR);
      }
      const { statementAmount, totalAllocated, kind } = await getStatementAmountAndSplits(
        ctx.db,
        input.statementId,
        '',
      );
      if (kind !== 'expense') {
        throw new Error('Cannot add split. Statement is not an expense.');
      }
      const newSplitAmount = Number.parseFloat(input.createSplitSchema.amount);
      if (totalAllocated + newSplitAmount > statementAmount) {
        throw new Error(
          `Cannot add split. Total allocated amount (${totalAllocated + newSplitAmount}) would exceed statement amount (${statementAmount}).`,
        );
      }
      return ctx.db
        .insert(splits)
        .values({
          userId: ctx.user.id,
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
        .where(and(eq(splits.id, input.splitId), eq(splits.userId, ctx.user.id)));
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
        .where(and(eq(splits.id, input.splitId), eq(splits.userId, ctx.user.id)));
      if (currentSplit.length === 0) {
        throw new Error('Split not found');
      }
      if (!(await friendBelongToUser(input.createSplitSchema.friendId, ctx.user.id, ctx.db))) {
        throw new Error(FRIEND_NOT_FOUND_ERROR);
      }
      const currentSplitAmount = Number.parseFloat(currentSplit[0].amount);
      const { statementId } = currentSplit[0];
      const { statementAmount, totalAllocated } = await getStatementAmountAndSplits(
        ctx.db,
        statementId,
        input.splitId,
      );
      if (totalAllocated + Number.parseFloat(input.createSplitSchema.amount) > statementAmount) {
        throw new Error(
          `Cannot update split. Total allocated amount (${totalAllocated + currentSplitAmount}) would exceed statement amount (${statementAmount}).`,
        );
      }
      return ctx.db
        .update(splits)
        .set({
          ...input.createSplitSchema,
        })
        .where(and(eq(splits.id, input.splitId), eq(splits.userId, ctx.user.id)));
    }),
});
