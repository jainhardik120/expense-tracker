import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { smsNotifications, statements } from '@/db/schema';
import type { Database } from '@/lib/db';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  createSmsNotificationSchema,
  smsNotificationListSchema,
  type SMSNotification,
} from '@/types';

import { buildQueryConditions } from '../helpers';

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
          ...{ ...input, timestamp: undefined },
          createdAt: input.timestamp,
          merchant: input.merchant ?? null,
          reference: input.reference ?? null,
          accountLast4: input.accountLast4 ?? null,
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
  getInsertHints: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const smsNotification = await getSMSNotification(ctx.db, ctx.user.id, input.id);
      return getHints(ctx.db, smsNotification, ctx.user.id);
    }),
});

const getSMSNotification = async (db: Database, userId: string, id: string) => {
  const smsNotification = await db
    .select()
    .from(smsNotifications)
    .where(and(eq(smsNotifications.id, id), eq(smsNotifications.userId, userId)))
    .limit(1);
  if (smsNotification.length === 0) {
    throw new Error('SMS notification not found');
  }
  return smsNotification[0];
};

const recentStatementsQuery = (db: Database, userId: string, where: SQL[]) =>
  db
    .select({
      accountId: statements.accountId,
      category: statements.category,
      tags: statements.tags,
    })
    .from(smsNotifications)
    .innerJoin(
      statements,
      eq(
        sql`CAST(${smsNotifications.additionalAttributes}->>'statementId' AS uuid)`,
        statements.id,
      ),
    )
    .where(and(...where, eq(smsNotifications.userId, userId)))
    .orderBy(desc(smsNotifications.createdAt))
    .limit(10)
    .as('recent_statements');

const getHints = async (db: Database, smsNotification: SMSNotification, userId: string) => {
  let recentBankNameStatements = recentStatementsQuery(db, userId, [
    eq(smsNotifications.bankName, smsNotification.bankName),
  ]);
  if (
    smsNotification.accountLast4 !== null &&
    !isNaN(parseInt(smsNotification.accountLast4)) &&
    parseInt(smsNotification.accountLast4) > 0
  ) {
    recentBankNameStatements = recentStatementsQuery(db, userId, [
      eq(smsNotifications.accountLast4, smsNotification.accountLast4),
    ]);
  }
  const bankIdHint = (
    await db
      .select({
        accountId: recentBankNameStatements.accountId,
        cnt: sql<number>`count(*)`,
      })
      .from(recentBankNameStatements)
      .where(sql`${recentBankNameStatements.accountId} is not null`)
      .groupBy(recentBankNameStatements.accountId)
      .orderBy(desc(sql`count(*)`))
  )
    .map((row) => row.accountId)
    .filter((id) => id !== null);

  let categoryHint: string[] = [];
  let tagsHint: string[] = [];

  if (smsNotification.merchant !== null) {
    const recentMerchantStatements = recentStatementsQuery(db, userId, [
      eq(smsNotifications.merchant, smsNotification.merchant),
    ]);
    const categoryHintValues = await db
      .select({
        category: recentMerchantStatements.category,
        cnt: sql<number>`count(*)`,
      })
      .from(recentMerchantStatements)
      .where(sql`${recentMerchantStatements.category} is not null`)
      .groupBy(recentMerchantStatements.category)
      .orderBy(desc(sql`count(*)`));
    categoryHint = categoryHintValues.map((row) => row.category);
    const tagsHintValues = await db
      .select({
        tag: sql<string>`t.tag`,
        cnt: sql<number>`count(*)`,
      })
      .from(recentMerchantStatements)
      .innerJoin(sql`LATERAL unnest(${recentMerchantStatements.tags}) AS t(tag)`, sql`true`)
      .groupBy(sql`t.tag`)
      .orderBy(desc(sql`count(*)`));
    tagsHint = tagsHintValues.map((row) => row.tag);
  }

  return {
    categoryHint,
    tagsHint,
    bankIdHint,
  };
};
