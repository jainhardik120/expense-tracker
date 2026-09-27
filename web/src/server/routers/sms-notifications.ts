import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { smsNotifications, statements } from '@/db/schema';
import type { Database } from '@/lib/db';
import { BULK_IMPORT_KINDS } from '@/lib/sms-bulk-import';
import {
  bulkInsertFromNotifications,
  getBulkImportRows,
} from '@/server/helpers/sms-bulk-insert';
import { getPendingSmsEstimate } from '@/server/helpers/sms-estimate';
import { getAccountsSummaryBetweenDates } from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  createSmsNotificationSchema,
  smsNotificationListSchema,
  type SMSNotification,
} from '@/types';

import { buildQueryConditions } from '../helpers';

/** One reviewed grid row. The rules it has to satisfy are checked in the helper,
 * against the same code the grid uses, so the two cannot drift apart. */
const bulkImportRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  amount: z.number(),
  statementKind: z.enum(BULK_IMPORT_KINDS),
  accountId: z.string(),
  friendId: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
});

export const smsNotificationsRouter = createTRPCRouter({
  /**
   * What the queue of unentered messages adds up to, with each account's balance
   * adjusted for what is waiting on it.
   */
  getPendingEstimate: protectedProcedure.query(async ({ ctx }) => {
    const [estimate, accounts] = await Promise.all([
      getPendingSmsEstimate(ctx.db, ctx.user.id),
      getAccountsSummaryBetweenDates(ctx.db, ctx.user.id),
    ]);
    const balanceById = new Map(accounts.map((entry) => [entry.account.id, entry.finalBalance]));
    const byAccount = estimate.byAccount.map((group) => {
      const balanceNow =
        group.accountId === null ? null : (balanceById.get(group.accountId) ?? null);
      return {
        ...group,
        balanceNow,
        balanceAfter:
          balanceNow === null ? null : balanceNow - group.pendingSpend + group.pendingIncome,
      };
    });
    const balanceNow = accounts.reduce((sum, entry) => sum + entry.finalBalance, 0);
    return {
      ...estimate,
      byAccount,
      balanceNow,
      balanceAfter: balanceNow - estimate.totalSpend + estimate.totalIncome,
    };
  }),
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
      // The phone retries an upload it never got an answer to, so the same
      // message can arrive twice: once from the attempt that did land, once
      // from the retry. A message is identified by who sent it, what it said
      // and for how much -- the timestamp is not part of that, because the
      // broadcast and the inbox disagree about it by a second or two.
      const existing = await ctx.db
        .select({ id: smsNotifications.id })
        .from(smsNotifications)
        .where(
          and(
            eq(smsNotifications.userId, ctx.user.id),
            eq(smsNotifications.sender, input.sender),
            eq(smsNotifications.smsBody, input.smsBody),
            eq(smsNotifications.amount, input.amount),
          ),
        )
        .limit(1);
      const alreadyStored = existing.at(0);
      if (alreadyStored !== undefined) {
        return alreadyStored;
      }
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
  /**
   * The whole pending queue as editable rows, each pre-filled the way
   * `getInsertHints` fills one — but resolved for every message in one go.
   */
  getBulkImportRows: protectedProcedure.query(({ ctx }) =>
    getBulkImportRows(ctx.db, ctx.user.id),
  ),
  bulkImport: protectedProcedure
    .input(z.object({ rows: z.array(bulkImportRowSchema).min(1) }))
    .mutation(({ ctx, input }) =>
      bulkInsertFromNotifications(ctx.db, ctx.user.id, input.rows),
    ),
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
