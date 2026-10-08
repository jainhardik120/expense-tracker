import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { emailInboxes, inboundEmails } from '@/db/schema';
import { type Database, lockUser } from '@/lib/db';
import { env } from '@/lib/env';
import logger from '@/lib/logger';
import {
  generateInboxToken,
  getActiveInbox,
  inboundDomain,
  inboxAddress,
} from '@/server/helpers/inbound-email/inbox';
import { deleteObject } from '@/server/helpers/inbound-email/storage';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

const RECENT_EMAILS = 100;
const INBOX_LOCK = 'email-inbox';

const requireDomain = () => {
  if (inboundDomain() === null) {
    throw new Error('Email forwarding is not configured on this server');
  }
};

const revokeActive = (db: Database, userId: string) =>
  db
    .update(emailInboxes)
    .set({ revokedAt: new Date() })
    .where(and(eq(emailInboxes.userId, userId), isNull(emailInboxes.revokedAt)));

const removeStoredCopies = async (objectKeys: Array<string | null>) => {
  const bucket = env.INBOUND_EMAIL_BUCKET;
  if (bucket === undefined) {
    return;
  }
  for (const objectKey of objectKeys) {
    if (objectKey !== null) {
      await deleteObject(bucket, objectKey).catch((error: unknown) => {
        logger.warn('Could not delete a stored inbound email', {
          objectKey,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
};

const createInbox = (db: Database, userId: string) =>
  db.insert(emailInboxes).values({ userId, token: generateInboxToken() }).returning();

export const emailForwardingRouter = createTRPCRouter({
  getInbox: protectedProcedure.query(async ({ ctx }) => {
    const inbox = await getActiveInbox(ctx.db, ctx.user.id);
    return {
      configured: inboundDomain() !== null,
      inbox:
        inbox === null
          ? null
          : {
              address: inboxAddress(inbox.token),
              createdAt: inbox.createdAt,
              confirmationCode: inbox.confirmationCode,
              confirmationUrl: inbox.confirmationUrl,
              confirmationReceivedAt: inbox.confirmationReceivedAt,
            },
    };
  }),
  enable: protectedProcedure.mutation(({ ctx }) => {
    requireDomain();
    return ctx.db.transaction(async (tx) => {
      await lockUser(tx, INBOX_LOCK, ctx.user.id);
      const existing = await getActiveInbox(tx, ctx.user.id);
      if (existing !== null) {
        return { id: existing.id };
      }
      const [created] = await createInbox(tx, ctx.user.id);
      return { id: created.id };
    });
  }),
  rotate: protectedProcedure.mutation(({ ctx }) => {
    requireDomain();
    return ctx.db.transaction(async (tx) => {
      await lockUser(tx, INBOX_LOCK, ctx.user.id);
      await revokeActive(tx, ctx.user.id);
      const [created] = await createInbox(tx, ctx.user.id);
      return { id: created.id };
    });
  }),
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const removed = await ctx.db.transaction(async (tx) => {
      await lockUser(tx, INBOX_LOCK, ctx.user.id);
      await revokeActive(tx, ctx.user.id);
      return tx
        .delete(inboundEmails)
        .where(eq(inboundEmails.userId, ctx.user.id))
        .returning({ objectKey: inboundEmails.objectKey });
    });
    await removeStoredCopies(removed.map((row) => row.objectKey));
  }),
  deleteEmails: protectedProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(1).max(RECENT_EMAILS) }))
    .mutation(async ({ ctx, input }) => {
      const removed = await ctx.db
        .delete(inboundEmails)
        .where(and(eq(inboundEmails.userId, ctx.user.id), inArray(inboundEmails.id, input.ids)))
        .returning({ objectKey: inboundEmails.objectKey });
      await removeStoredCopies(removed.map((row) => row.objectKey));
      return removed.length;
    }),
  listEmails: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: inboundEmails.id,
        receivedAt: inboundEmails.receivedAt,
        fromAddress: inboundEmails.fromAddress,
        subject: inboundEmails.subject,
        status: inboundEmails.status,
        rejectReason: inboundEmails.rejectReason,
        dkimVerdict: inboundEmails.dkimVerdict,
        dmarcVerdict: inboundEmails.dmarcVerdict,
        attachments: inboundEmails.attachments,
        storedRaw: sql<boolean>`${inboundEmails.objectKey} IS NOT NULL`,
        statementImports: sql<
          Array<{ id: string; status: 'review' | 'applied' | 'discarded' }>
        >`COALESCE((
          SELECT json_agg(json_build_object('id', i.id, 'status', i.status))
          FROM statement_imports i WHERE i.inbound_email_id = "inbound_emails"."id"
        ), '[]'::json)`,
      })
      .from(inboundEmails)
      .where(eq(inboundEmails.userId, ctx.user.id))
      .orderBy(desc(inboundEmails.receivedAt))
      .limit(RECENT_EMAILS),
  ),
});
