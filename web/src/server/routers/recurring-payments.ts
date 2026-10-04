import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { recurringPayments, statements } from '@/db/schema';
import { getDefaultDateRange, getTimezone, startOfDayLocal } from '@/lib/date';
import { type Database } from '@/lib/db';
import {
  isRecurringPaymentActive,
  getPeriodInDays,
  generatePaymentSchedule,
  findScheduledOccurrence,
  isOccurrenceSettled,
} from '@/server/helpers/recurring-calculations';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createRecurringPaymentSchema, recurringPaymentParserSchema } from '@/types';

import {
  getLinkedStatementsRecurringPayment,
  getRecurringPayment,
  lockStatementAttributes,
} from '../helpers/emi';

const RECURRING_PAYMENT_NOT_FOUND = 'Recurring payment not found';

const isEnded = sql`(${recurringPayments.endDate} IS NOT NULL AND ${recurringPayments.endDate} <= now())`;

const setStatementAttributes = (
  db: Database,
  userId: string,
  statementId: string,
  changes: Record<string, unknown>,
) =>
  db.transaction(async (tx) => {
    const { attributes } = await lockStatementAttributes(tx, userId, statementId);
    await tx
      .update(statements)
      .set({ additionalAttributes: { ...(attributes as Record<string, unknown>), ...changes } })
      .where(eq(statements.id, statementId));
    return { success: true };
  });

export const recurringPaymentsRouter = createTRPCRouter({
  getRecurringPayments: protectedProcedure
    .input(recurringPaymentParserSchema)
    .query(async ({ ctx, input }) => {
      const conditions = [eq(recurringPayments.userId, ctx.user.id)];

      if (input.category.length > 0) {
        conditions.push(inArray(recurringPayments.category, input.category));
      }

      if (input.frequency.length > 0) {
        conditions.push(inArray(recurringPayments.frequency, input.frequency));
      }

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(recurringPayments)
        .where(and(...conditions));

      const offset = (input.page - 1) * input.perPage;
      const payments = await ctx.db
        .select()
        .from(recurringPayments)
        .where(and(...conditions))
        .orderBy(sql`${isEnded} ASC`, asc(recurringPayments.name))
        .limit(input.perPage)
        .offset(offset);

      const pageCount = Math.ceil(count / input.perPage);

      return {
        recurringPayments: payments,
        pageCount,
        rowsCount: count,
      };
    }),

  addRecurringPayment: protectedProcedure
    .input(createRecurringPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      const timezone = await getTimezone();

      const startDate = startOfDayLocal(input.startDate, timezone);
      const endDate = input.endDate === null ? null : startOfDayLocal(input.endDate, timezone);

      return ctx.db
        .insert(recurringPayments)
        .values({
          userId: ctx.user.id,
          ...input,
          startDate,
          endDate,
        })
        .returning({ id: recurringPayments.id });
    }),

  updateRecurringPayment: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        ...createRecurringPaymentSchema.shape,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      const timezone = await getTimezone();
      const startDate = startOfDayLocal(updateData.startDate, timezone);
      const endDate =
        updateData.endDate === null ? null : startOfDayLocal(updateData.endDate, timezone);
      const result = await ctx.db
        .update(recurringPayments)
        .set({ ...updateData, startDate, endDate })
        .where(and(eq(recurringPayments.id, id), eq(recurringPayments.userId, ctx.user.id)))
        .returning({ id: recurringPayments.id });

      if (result.length === 0) {
        throw new Error('Recurring payment not found or access denied');
      }

      return result;
    }),

  deleteRecurringPayment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(recurringPayments)
        .where(and(eq(recurringPayments.id, input.id), eq(recurringPayments.userId, ctx.user.id)))
        .returning({ id: recurringPayments.id });

      if (result.length === 0) {
        throw new Error(RECURRING_PAYMENT_NOT_FOUND);
      }

      return result;
    }),

  getLinkCandidates: protectedProcedure
    .input(z.object({ statementDate: z.date() }))
    .query(async ({ ctx, input }) => {
      const timezone = await getTimezone();
      const allRecurringPayments = await ctx.db
        .select()
        .from(recurringPayments)
        .where(eq(recurringPayments.userId, ctx.user.id));
      const linkedStatements = await ctx.db
        .select({
          id: statements.id,
          amount: statements.amount,
          createdAt: statements.createdAt,
          recurringPaymentId: sql<string>`${statements.additionalAttributes}->>'recurringPaymentId'`,
        })
        .from(statements)
        .where(
          and(
            eq(statements.userId, ctx.user.id),
            sql`${statements.additionalAttributes}->>'recurringPaymentId' IS NOT NULL`,
          ),
        );
      const linkedByPayment = new Map<string, typeof linkedStatements>();
      for (const statement of linkedStatements) {
        const existing = linkedByPayment.get(statement.recurringPaymentId) ?? [];
        existing.push(statement);
        linkedByPayment.set(statement.recurringPaymentId, existing);
      }
      return allRecurringPayments
        .map((recurringPayment) => {
          const occurrence = findScheduledOccurrence(
            recurringPayment,
            input.statementDate,
            timezone,
          );
          if (occurrence === null) {
            return null;
          }
          const settled = isOccurrenceSettled(
            recurringPayment,
            occurrence,
            linkedByPayment.get(recurringPayment.id) ?? [],
            timezone,
          );
          if (settled) {
            return null;
          }
          return {
            id: recurringPayment.id,
            name: recurringPayment.name,
            category: recurringPayment.category,
            amount: recurringPayment.amount,
            scheduledDate: occurrence,
          };
        })
        .filter((candidate) => candidate !== null)
        .sort(
          (left, right) =>
            Math.abs(left.scheduledDate.getTime() - input.statementDate.getTime()) -
            Math.abs(right.scheduledDate.getTime() - input.statementDate.getTime()),
        );
    }),

  linkStatement: protectedProcedure
    .input(
      z.object({
        recurringPaymentId: z.string(),
        statementId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getRecurringPayment(ctx.db, ctx.user.id, input.recurringPaymentId);
      return setStatementAttributes(ctx.db, ctx.user.id, input.statementId, {
        recurringPaymentId: input.recurringPaymentId,
      });
    }),

  unlinkStatement: protectedProcedure
    .input(
      z.object({
        statementId: z.string(),
      }),
    )
    .mutation(({ ctx, input }) =>
      setStatementAttributes(ctx.db, ctx.user.id, input.statementId, {
        recurringPaymentId: undefined,
      }),
    ),

  getLinkedStatements: protectedProcedure
    .input(
      z.object({
        recurringPaymentId: z.string(),
      }),
    )
    .query(({ ctx, input }) => {
      return getLinkedStatementsRecurringPayment(ctx.db, ctx.user.id, input.recurringPaymentId);
    }),

  getRecurringPaymentDetails: protectedProcedure
    .input(
      z.object({
        recurringPaymentId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const timezone = await getTimezone();
      const { endOfYear } = getDefaultDateRange(timezone);

      const recurringPayment = await getRecurringPayment(
        ctx.db,
        ctx.user.id,
        input.recurringPaymentId,
      );

      const linkedStatements = await getLinkedStatementsRecurringPayment(
        ctx.db,
        ctx.user.id,
        input.recurringPaymentId,
      );

      const { schedule, nextPaymentDate } = generatePaymentSchedule(
        recurringPayment,
        linkedStatements,
        timezone,
        endOfYear,
      );

      const multiplier = parseFloat(recurringPayment.frequencyMultiplier);
      const periodDays = getPeriodInDays(recurringPayment.frequency, multiplier);

      return {
        recurringPayment,
        linkedStatements,
        schedule,
        nextPaymentDate,
        isActive: isRecurringPaymentActive(recurringPayment),
        periodDays,
      };
    }),
});
