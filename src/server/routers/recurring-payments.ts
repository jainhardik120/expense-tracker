import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { recurringPayments } from '@/db/schema';
import { getTimezone, startOfDayLocal } from '@/lib/date';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createRecurringPaymentSchema, recurringPaymentParserSchema } from '@/types';

const RECURRING_PAYMENT_NOT_FOUND = 'Recurring payment not found or access denied';

export const recurringPaymentsRouter = createTRPCRouter({
  getRecurringPayments: protectedProcedure
    .input(recurringPaymentParserSchema)
    .query(async ({ ctx, input }) => {
      const conditions = [eq(recurringPayments.userId, ctx.session.user.id)];

      if (input.category.length > 0) {
        conditions.push(inArray(recurringPayments.category, input.category));
      }

      if (input.frequency.length > 0) {
        conditions.push(inArray(recurringPayments.frequency, input.frequency));
      }

      if (input.isActive !== undefined) {
        conditions.push(eq(recurringPayments.isActive, input.isActive));
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
          userId: ctx.session.user.id,
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
        .where(and(eq(recurringPayments.id, id), eq(recurringPayments.userId, ctx.session.user.id)))
        .returning({ id: recurringPayments.id });

      if (result.length === 0) {
        throw new Error(RECURRING_PAYMENT_NOT_FOUND);
      }

      return result;
    }),

  deleteRecurringPayment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(recurringPayments)
        .where(
          and(
            eq(recurringPayments.id, input.id),
            eq(recurringPayments.userId, ctx.session.user.id),
          ),
        )
        .returning({ id: recurringPayments.id });

      if (result.length === 0) {
        throw new Error(RECURRING_PAYMENT_NOT_FOUND);
      }

      return result;
    }),
});
