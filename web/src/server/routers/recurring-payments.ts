import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { recurringPayments, statements } from '@/db/schema';
import { getDefaultDateRange, getTimezone, startOfDayLocal } from '@/lib/date';
import {
  isRecurringPaymentActive,
  getPeriodInDays,
  generatePaymentSchedule,
} from '@/server/helpers/recurring-calculations';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createRecurringPaymentSchema, recurringPaymentParserSchema } from '@/types';

import {
  getLinkedStatementsRecurringPayment,
  getRecurringPayment,
  getStatementAttributes,
} from '../helpers/emi';

const RECURRING_PAYMENT_NOT_FOUND = 'Recurring payment not found';

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
        .orderBy(desc(recurringPayments.createdAt))
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

  linkStatement: protectedProcedure
    .input(
      z.object({
        recurringPaymentId: z.string(),
        statementId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify recurring payment exists
      await getRecurringPayment(ctx.db, ctx.user.id, input.recurringPaymentId);
      // Verify statement exists
      const attributes = (await getStatementAttributes(ctx.db, ctx.user.id, input.statementId))
        .attributes as Partial<Record<string, unknown>>;

      // Link statement to recurring payment (no strict validation on amount/date)
      await ctx.db
        .update(statements)
        .set({
          additionalAttributes: {
            ...attributes,
            recurringPaymentId: input.recurringPaymentId,
          },
        })
        .where(eq(statements.id, input.statementId));

      return { success: true };
    }),

  unlinkStatement: protectedProcedure
    .input(
      z.object({
        statementId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const attributes = (await getStatementAttributes(ctx.db, ctx.user.id, input.statementId))
        .attributes as Partial<Record<string, unknown>>;

      await ctx.db
        .update(statements)
        .set({
          additionalAttributes: {
            ...attributes,
            recurringPaymentId: undefined,
          },
        })
        .where(eq(statements.id, input.statementId));

      return { success: true };
    }),

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

      // Get recurring payment
      const recurringPayment = await getRecurringPayment(
        ctx.db,
        ctx.user.id,
        input.recurringPaymentId,
      );

      // Get linked statements
      const linkedStatements = await getLinkedStatementsRecurringPayment(
        ctx.db,
        ctx.user.id,
        input.recurringPaymentId,
      );

      // Generate payment schedule with status
      const { schedule, nextPaymentDate } = generatePaymentSchedule(
        recurringPayment,
        linkedStatements,
        timezone,
        endOfYear,
      );

      // Calculate period in days
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
