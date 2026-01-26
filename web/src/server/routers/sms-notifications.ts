import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { smsNotifications } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createSmsNotificationSchema, smsNotificationListSchema } from '@/types';

import { buildQueryConditions } from '../helpers/summary';

export const smsNotificationsRouter = createTRPCRouter({
  create: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/sms-notifications',
      },
    })
    .input(createSmsNotificationSchema)
    .output(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ids = await ctx.db
        .insert(smsNotifications)
        .values({
          userId: ctx.user.id,
          amount: input.amount,
          type: input.type,
          merchant: input.merchant ?? null,
          reference: input.reference ?? null,
          accountLast4: input.accountLast4 ?? null,
          smsBody: input.smsBody,
          sender: input.sender,
          createdAt: input.timestamp,
          bankName: input.bankName,
          isFromCard: input.isFromCard,
          currency: input.currency,
          fromAccount: input.fromAccount ?? null,
          toAccount: input.toAccount ?? null,
        })
        .returning({ id: smsNotifications.id });
      if (ids.length === 0) {
        throw new Error('Failed to create sms notification');
      }
      return ids[0];
    }),
  list: protectedProcedure.input(smsNotificationListSchema).query(async ({ ctx, input }) => {
    const conditions = buildQueryConditions(smsNotifications, ctx.user.id, input.start, input.end);
    if (input.status.length > 0) {
      conditions.push(inArray(smsNotifications.status, input.status));
    }
    const [{ count }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(smsNotifications)
      .where(and(...conditions));

    const offset = (input.page - 1) * input.perPage;
    const notifications = await ctx.db
      .select()
      .from(smsNotifications)
      .where(and(...conditions))
      .orderBy(desc(smsNotifications.createdAt))
      .limit(input.perPage)
      .offset(offset);

    const pageCount = Math.ceil(count / input.perPage);

    return {
      notifications,
      pageCount,
      rowsCount: count,
    };
  }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['pending', 'inserted', 'junked']),
        statementId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(smsNotifications)
        .set({
          ...{
            status: input.status,
            additionalAttributes: {
              statementId: input.statementId,
            },
          },
        })
        .where(and(eq(smsNotifications.id, input.id), eq(smsNotifications.userId, ctx.user.id)))
        .returning({ id: smsNotifications.id });
      if (result.length === 0) {
        throw new Error('SMS notification not found');
      }
      return result[0];
    }),
});
