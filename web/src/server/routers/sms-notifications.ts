import { and, desc, eq, inArray, count as countRows } from 'drizzle-orm';
import { z } from 'zod';

import { smsNotifications } from '@/db/schema';
import { getTimezone } from '@/lib/date';
import { lockUser } from '@/lib/db';
import { BULK_IMPORT_KINDS } from '@/lib/sms-bulk-import';
import { resolveSmsType } from '@/lib/sms-notification-rules';
import { bulkInsertFromNotifications, getBulkImportRows } from '@/server/helpers/sms-bulk-insert';
import { getPendingSmsEstimate } from '@/server/helpers/sms-estimate';
import { getHintSubject, getInsertHintsForOne } from '@/server/helpers/sms-hints';
import { getAccountsSummaryBetweenDates } from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createSmsNotificationSchema, smsNotificationListSchema } from '@/types';

import { buildQueryConditions } from '../helpers';

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
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockUser(tx, 'sms-notifications', ctx.user.id);
        const existing = await tx
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
        const [created] = await tx
          .insert(smsNotifications)
          .values({
            userId: ctx.user.id,
            ...{ ...input, timestamp: undefined },
            createdAt: input.timestamp,
            type: resolveSmsType(input.type, input.merchant, ctx.user.name),
            merchant: input.merchant ?? null,
            reference: input.reference ?? null,
            accountLast4: input.accountLast4 ?? null,
            fromAccount: input.fromAccount ?? null,
            toAccount: input.toAccount ?? null,
          })
          .returning({ id: smsNotifications.id });
        return created;
      }),
    ),
  list: protectedProcedure.input(smsNotificationListSchema).query(async ({ ctx, input }) => {
    const conditions = buildQueryConditions(smsNotifications, ctx.user.id, input.start, input.end);
    if (input.status.length > 0) {
      conditions.push(inArray(smsNotifications.status, input.status));
    }
    const [{ count }] = await ctx.db
      .select({ count: countRows() })
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
      const subject = await getHintSubject(ctx.db, ctx.user.id, input.id);
      const hints = await getInsertHintsForOne(ctx.db, ctx.user.id, subject);
      return {
        bankIdHint: hints.accountIds,
        categoryHint: hints.categories,
        tagsHint: hints.tags,
      };
    }),
  getBulkImportRows: protectedProcedure.query(async ({ ctx }) =>
    getBulkImportRows(ctx.db, ctx.user.id, await getTimezone()),
  ),
  bulkImport: protectedProcedure
    .input(z.object({ rows: z.array(bulkImportRowSchema).min(1) }))
    .mutation(async ({ ctx, input }) =>
      bulkInsertFromNotifications(ctx.db, ctx.user.id, input.rows, await getTimezone()),
    ),
});
