import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import {
  bankAccount,
  friendsProfiles,
  selfTransferStatements,
  splits,
  statements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createSelfTransferSchema, createSplitSchema, createStatementSchema } from '@/types';

export const statementsRouter = createTRPCRouter({
  getStatements: protectedProcedure.query(async ({ ctx }) => {
    const splitTotals = ctx.db.$with('split_totals').as(
      ctx.db
        .select({
          statementId: splits.statementId,
          total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number).as('total'),
        })
        .from(splits)
        .groupBy(splits.statementId),
    );
    return (
      await ctx.db
        .with(splitTotals)
        .select({
          statements,
          accountName: bankAccount.accountName,
          friendName: friendsProfiles.name,
          totalSplit: sql<number>`COALESCE(${splitTotals.total}, 0)`.mapWith(Number),
        })
        .from(statements)
        .leftJoin(bankAccount, eq(bankAccount.id, statements.accountId))
        .leftJoin(friendsProfiles, eq(friendsProfiles.id, statements.friendId))
        .leftJoin(splitTotals, eq(splitTotals.statementId, statements.id))
        .where(eq(statements.userId, ctx.session.user.id))
        .orderBy(desc(statements.createdAt))
    ).map((row) => {
      return {
        ...row.statements,
        splitAmount: row.totalSplit,
        accountName: row.accountName,
        friendName: row.friendName,
      };
    });
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
  getSelfTransferStatements: protectedProcedure.query(async ({ ctx }) => {
    const fromAccount = alias(bankAccount, 'from_account');
    const toAccount = alias(bankAccount, 'to_account');
    return (
      await ctx.db
        .select({
          selfTransferStatements,
          fromAccount: fromAccount.accountName,
          toAccount: toAccount.accountName,
        })
        .from(selfTransferStatements)
        .leftJoin(fromAccount, eq(fromAccount.id, selfTransferStatements.fromAccountId))
        .leftJoin(toAccount, eq(toAccount.id, selfTransferStatements.toAccountId))
        .where(eq(selfTransferStatements.userId, ctx.session.user.id))
        .orderBy(desc(selfTransferStatements.createdAt))
    ).map((row) => {
      return {
        ...row.selfTransferStatements,
        fromAccount: row.fromAccount,
        toAccount: row.toAccount,
      };
    });
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

const getStatementAmountAndSplits = async (
  db: Database,
  statementId: string,
  exceptSplitId: string = '',
) => {
  const statementResult = await db
    .select({ amount: statements.amount, kind: statements.statementKind })
    .from(statements)
    .where(eq(statements.id, statementId));
  if (statementResult.length === 0) {
    throw new Error('Statement not found');
  }
  const statement = statementResult[0];
  const query = db
    .select({ sum: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number) })
    .from(splits);
  if (typeof exceptSplitId === 'string' && exceptSplitId.trim() !== '') {
    query.where(and(eq(splits.statementId, statementId), ne(splits.id, exceptSplitId)));
  } else {
    query.where(eq(splits.statementId, statementId));
  }
  const totalAllocatedResult = await query.then((res) => res[0]);
  return {
    kind: statement.kind,
    statementAmount: parseFloat(statement.amount),
    totalAllocated: totalAllocatedResult.sum,
  };
};
