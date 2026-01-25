import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { smsNotifications } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 100;

const createSmsNotificationSchema = z.object({
  amount: z.string(),
  type: z.enum(['income', 'expense', 'credit', 'transfer', 'investment']),
  merchant: z.string().nullish(),
  reference: z.string().nullish(),
  accountLast4: z.string().nullish(),
  smsBody: z.string(),
  sender: z.string(),
  timestamp: z.date(),
  bankName: z.string(),
  isFromCard: z.string().default('false'),
  currency: z.string().default('INR'),
  fromAccount: z.string().nullish(),
  toAccount: z.string().nullish(),
});

const smsNotificationListSchema = z.object({
  page: z.number().min(1).default(DEFAULT_PAGE),
  perPage: z.number().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
  status: z.array(z.enum(['pending', 'inserted', 'junked'])).default([]),
  timestampFrom: z.date().optional(),
  timestampTo: z.date().optional(),
});

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
          timestamp: input.timestamp,
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
    const conditions = [eq(smsNotifications.userId, ctx.user.id)];

    if (input.status.length > 0) {
      conditions.push(inArray(smsNotifications.status, input.status));
    }

    if (input.timestampFrom !== undefined) {
      conditions.push(gte(smsNotifications.timestamp, input.timestampFrom));
    }

    if (input.timestampTo !== undefined) {
      conditions.push(lte(smsNotifications.timestamp, input.timestampTo));
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
      .orderBy(desc(smsNotifications.timestamp))
      .limit(input.perPage)
      .offset(offset);

    const pageCount = Math.ceil(count / input.perPage);

    return {
      notifications,
      pageCount,
      rowsCount: count,
    };
  }),
});
