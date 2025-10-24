import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { selfTransferStatements, splits, statements } from '@/db/schema';
import {
  getMergedStatements,
  getRowsCount,
  getStatementAmountAndSplits,
  mergeRawStatementsWithSummary,
} from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  createSelfTransferSchema,
  createSplitSchema,
  createStatementSchema,
  statementParserSchema,
} from '@/types';

export const statementsRouter = createTRPCRouter({
  getCategories: protectedProcedure.query(async ({ ctx }) => {
    return (
      await ctx.db
        .selectDistinct({ category: statements.category })
        .from(statements)
        .where(eq(statements.userId, ctx.session.user.id))
    ).map((c) => c.category);
  }),
  getTags: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .selectDistinct({ tag: sql<string>`unnest(${statements.tags})`.as('tag') })
      .from(statements)
      .where(eq(statements.userId, ctx.session.user.id))
      .orderBy(sql<string>`tag`);
    return result.map((r) => r.tag);
  }),
  getStatements: protectedProcedure.input(statementParserSchema).query(async ({ ctx, input }) => {
    let statements = await getMergedStatements(ctx.db, ctx.session.user.id, input);
    let summary = null;
    if (input.account.length === 1 && input.category.length === 0) {
      const accountId = input.account[0];
      const { summary: accountSummary, statements: accountStatements } =
        await mergeRawStatementsWithSummary(
          ctx.db,
          ctx.session.user.id,
          accountId,
          statements,
          input,
        );
      summary = accountSummary;
      statements = accountStatements;
    }
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
      const newSplitAmount = Number.parseFloat(input.createSplitSchema.amount);
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
        .where(and(eq(splits.id, input.splitId), eq(splits.userId, ctx.session.user.id)));
    }),
});
