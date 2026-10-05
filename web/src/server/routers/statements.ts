import { and, asc, eq, inArray, sql, arrayContains, not } from 'drizzle-orm';
import { z } from 'zod';

import {
  salaryPayments,
  selfTransferStatements,
  splits,
  statementKindEnum,
  statements,
} from '@/db/schema';
import { buildQueryConditions } from '@/server/helpers';
import { assertOwnsAccountsAndFriends } from '@/server/helpers/account';
import {
  getMergedStatements,
  getRowsCount,
  getStatementTimeline,
  getStatementAmountAndSplits,
  splitTotalsByStatement,
  getStatementFacetCounts,
  mergeRawStatementsWithSummary,
} from '@/server/helpers/statement';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  bulkSplitSchema,
  createSelfTransferSchema,
  createSplitSchema,
  createStatementSchema,
  dateSchema,
  ONE_HUNDRED_PERCENTAGE,
  parseStatementSort,
  statementParserSchema,
  statementsResponseSchema,
  updateStatementTaxableIncomeSchema,
} from '@/types';

const asOptionalId = (value: string | null | undefined) =>
  value === undefined || value === null || value === '' ? null : value;

export const statementsRouter = createTRPCRouter({
  getCategories: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/statements/categories',
      },
    })
    .input(
      z.object({
        ...dateSchema,
        statementKind: z.array(z.enum(statementKindEnum.enumValues)).optional(),
      }),
    )
    .output(z.array(z.string()))
    .query(async ({ ctx, input }) => {
      const conditions = buildQueryConditions(statements, ctx.user.id, input.start, input.end);
      const statementKind = input.statementKind ?? [];
      if (statementKind.length > 0) {
        conditions.push(inArray(statements.statementKind, statementKind));
      }
      return (
        await ctx.db
          .selectDistinct({ category: statements.category })
          .from(statements)
          .where(and(...conditions))
      )
        .map((c) => c.category)
        .sort((a, b) => a.localeCompare(b));
    }),
  getTags: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/statements/tags',
      },
    })
    .input(
      z.object({
        ...dateSchema,
        statementKind: z.array(z.enum(statementKindEnum.enumValues)).optional(),
        category: z.string().array().optional(),
      }),
    )
    .output(z.array(z.string()))
    .query(async ({ ctx, input }) => {
      const conditions = buildQueryConditions(statements, ctx.user.id, input.start, input.end);
      const statementKind = input.statementKind ?? [];
      const category = input.category ?? [];
      if (statementKind.length > 0) {
        conditions.push(inArray(statements.statementKind, statementKind));
      }
      if (category.length > 0) {
        conditions.push(inArray(statements.category, category));
      }
      const result = await ctx.db
        .selectDistinct({ tag: sql<string>`unnest(${statements.tags})`.as('tag') })
        .from(statements)
        .where(and(...conditions))
        .orderBy(sql<string>`tag`);
      return result.map((r) => r.tag).sort((a, b) => a.localeCompare(b));
    }),
  getTimeline: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/statements/timeline',
      },
    })
    .input(
      statementParserSchema.omit({ page: true, perPage: true, sort: true }).extend({
        timezone: z
          .string()
          .regex(/^[A-Za-z0-9_+\-/]+$/)
          .optional()
          .default('Asia/Kolkata'),
      }),
    )
    .output(z.array(z.object({ date: z.string(), count: z.number() })))
    .query(async ({ ctx, input }) => {
      const { timezone, ...filters } = input;
      return getStatementTimeline(ctx.db, ctx.user.id, { ...filters, sort: '' }, timezone);
    }),
  getFacetCounts: protectedProcedure
    .input(statementParserSchema.omit({ page: true, perPage: true }))
    .query(async ({ ctx, input }) => getStatementFacetCounts(ctx.db, ctx.user.id, input)),
  getStatements: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/statements',
      },
    })
    .input(statementParserSchema)
    .output(statementsResponseSchema)
    .query(async ({ ctx, input }) => {
      let statements = await getMergedStatements(ctx.db, ctx.user.id, input);
      let summary = null;
      const sort = parseStatementSort(input.sort);
      const isChronological = sort.length === 0 || sort[0].id === 'date';
      if (
        isChronological &&
        input.account.length === 1 &&
        input.category.length === 0 &&
        input.statementKind.length === 0 &&
        input.tags.length === 0
      ) {
        const accountId = input.account[0];
        const { summary: accountSummary, statements: accountStatements } =
          await mergeRawStatementsWithSummary(
            ctx.db,
            ctx.user.id,
            accountId,
            statements,
            input,
            sort.length > 0 && !sort[0].desc,
          );
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
  createStatement: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/statements',
      },
    })
    .input(createStatementSchema)
    .output(z.array(z.object({ id: z.string() })))
    .mutation(async ({ ctx, input }) => {
      const accountId = asOptionalId(input.accountId);
      const friendId = asOptionalId(input.friendId);
      await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, {
        accountIds: [accountId],
        friendIds: [friendId],
      });
      return ctx.db
        .insert(statements)
        .values({
          userId: ctx.user.id,
          ...input,
          accountId,
          friendId,
        })
        .returning({ id: statements.id });
    }),
  updateStatement: protectedProcedure
    .meta({
      openapi: {
        method: 'PUT',
        path: '/statements/{id}',
      },
    })
    .input(createStatementSchema.extend({ id: z.string() }))
    .output(z.array(z.object({ id: z.string() })))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const currentStatement = (
        await ctx.db
          .select({ amount: statements.amount, taxableAmount: statements.taxableAmount })
          .from(statements)
          .where(and(eq(statements.id, id), eq(statements.userId, ctx.user.id)))
          .limit(1)
      ).at(0);
      if (currentStatement === undefined) {
        throw new Error('Statement not found');
      }
      const accountId = asOptionalId(fields.accountId);
      const friendId = asOptionalId(fields.friendId);
      await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, {
        accountIds: [accountId],
        friendIds: [friendId],
      });
      const nextAmount = Number(fields.amount);
      const remainsTaxableCandidate =
        fields.statementKind === 'outside_transaction' && nextAmount > 0;
      let { taxableAmount } = currentStatement;
      if (!remainsTaxableCandidate) {
        taxableAmount = null;
      } else if (taxableAmount !== null) {
        const previousAmount = Number(currentStatement.amount);
        const previousTaxableAmount = Number(taxableAmount);
        if (previousTaxableAmount === previousAmount) {
          taxableAmount = fields.amount;
        } else if (previousTaxableAmount > nextAmount) {
          taxableAmount = null;
        }
      }
      return ctx.db
        .update(statements)
        .set({
          ...fields,
          taxableAmount,
          accountId,
          friendId,
        })
        .where(and(eq(statements.id, id), eq(statements.userId, ctx.user.id)))
        .returning({ id: statements.id });
    }),
  updateTaxableIncome: protectedProcedure
    .input(updateStatementTaxableIncomeSchema)
    .mutation(async ({ ctx, input }) => {
      const statement = (
        await ctx.db
          .select({
            amount: statements.amount,
            statementKind: statements.statementKind,
            salaryPaymentId: salaryPayments.id,
          })
          .from(statements)
          .leftJoin(salaryPayments, eq(salaryPayments.statementId, statements.id))
          .where(and(eq(statements.id, input.statementId), eq(statements.userId, ctx.user.id)))
          .limit(1)
      ).at(0);
      if (statement === undefined) {
        throw new Error('Statement not found');
      }
      const statementAmount = Number(statement.amount);
      if (statement.statementKind !== 'outside_transaction' || statementAmount <= 0) {
        throw new Error('Only incoming outside transactions can be marked as taxable income');
      }
      if (statement.salaryPaymentId !== null) {
        throw new Error('Salary-linked statements are already included in the tax projection');
      }
      if (input.taxableAmount !== null) {
        const taxableAmount = Number(input.taxableAmount);
        if (taxableAmount <= 0 || taxableAmount > statementAmount) {
          throw new Error('Taxable amount must be greater than zero and no more than the credit');
        }
      }
      return ctx.db
        .update(statements)
        .set({ taxableAmount: input.taxableAmount })
        .where(and(eq(statements.id, input.statementId), eq(statements.userId, ctx.user.id)))
        .returning({ id: statements.id, taxableAmount: statements.taxableAmount });
    }),
  deleteStatement: protectedProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/statements/{id}',
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(statements)
        .where(and(eq(statements.id, input.id), eq(statements.userId, ctx.user.id)));
    }),
  createSelfTransferStatement: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/statements/self-transfer',
      },
    })
    .input(createSelfTransferSchema)
    .output(z.array(z.object({ id: z.string() })))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, {
        accountIds: [input.fromAccountId, input.toAccountId],
      });
      return ctx.db
        .insert(selfTransferStatements)
        .values({
          userId: ctx.user.id,
          ...input,
        })
        .returning({ id: statements.id });
    }),
  updateSelfTransferStatement: protectedProcedure
    .meta({
      openapi: {
        method: 'PUT',
        path: '/statements/self-transfer/{id}',
      },
    })
    .input(createSelfTransferSchema.extend({ id: z.string() }))
    .output(z.array(z.object({ id: z.string() })))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, {
        accountIds: [fields.fromAccountId, fields.toAccountId],
      });
      return ctx.db
        .update(selfTransferStatements)
        .set(fields)
        .where(
          and(eq(selfTransferStatements.id, id), eq(selfTransferStatements.userId, ctx.user.id)),
        )
        .returning({ id: selfTransferStatements.id });
    }),
  deleteSelfTransferStatement: protectedProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/statements/self-transfer/{id}',
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
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
  addBulkStatementTag: protectedProcedure
    .input(
      z.object({
        statementIds: z.array(z.string()),
        tag: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(statements)
        .set({ tags: sql`array_append(${statements.tags}, ${input.tag})` })
        .where(
          and(
            eq(statements.userId, ctx.user.id),
            inArray(statements.id, input.statementIds),
            not(arrayContains(statements.tags, [input.tag])),
          ),
        )
        .returning({ id: statements.id });
      return { tagged: updated.length };
    }),

  createBulkStatementSplits: protectedProcedure
    .input(
      z.object({
        statementIds: z.array(z.string()),
        bulkSplitSchema: bulkSplitSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (db) => {
        await db
          .select({ id: statements.id })
          .from(statements)
          .where(
            and(eq(statements.userId, ctx.user.id), inArray(statements.id, input.statementIds)),
          )
          .orderBy(asc(statements.id))
          .for('update');
        const splitTotals = splitTotalsByStatement(db, ctx.user.id, input.statementIds);
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
        await db.insert(splits).values(inserts);
      }),
    ),
  createStatementSplit: protectedProcedure
    .input(
      z.object({
        statementId: z.string(),
        createSplitSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, {
        friendIds: [input.createSplitSchema.friendId],
      });
      return ctx.db.transaction(async (tx) => {
        const { statementAmount, totalAllocated, kind } = await getStatementAmountAndSplits(
          tx,
          ctx.user.id,
          input.statementId,
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
        return tx
          .insert(splits)
          .values({
            userId: ctx.user.id,
            statementId: input.statementId,
            ...input.createSplitSchema,
          })
          .returning({ id: splits.id });
      });
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
      return ctx.db.transaction(async (tx) => {
        const currentSplit = await tx
          .select()
          .from(splits)
          .where(and(eq(splits.id, input.splitId), eq(splits.userId, ctx.user.id)));
        if (currentSplit.length === 0) {
          throw new Error('Split not found');
        }
        await assertOwnsAccountsAndFriends(tx, ctx.user.id, {
          friendIds: [input.createSplitSchema.friendId],
        });
        const { statementId } = currentSplit[0];
        const { statementAmount, totalAllocated } = await getStatementAmountAndSplits(
          tx,
          ctx.user.id,
          statementId,
          input.splitId,
        );
        const newTotal = totalAllocated + Number.parseFloat(input.createSplitSchema.amount);
        if (newTotal > statementAmount) {
          throw new Error(
            `Cannot update split. Total allocated amount (${newTotal}) would exceed statement amount (${statementAmount}).`,
          );
        }
        return tx
          .update(splits)
          .set({
            ...input.createSplitSchema,
          })
          .where(and(eq(splits.id, input.splitId), eq(splits.userId, ctx.user.id)));
      });
    }),
});
