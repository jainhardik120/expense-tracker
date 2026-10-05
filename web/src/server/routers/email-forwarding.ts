import { and, desc, eq, isNull } from 'drizzle-orm';

import { emailInboxes, inboundEmails } from '@/db/schema';
import { type Database, lockUser } from '@/lib/db';
import {
  generateInboxToken,
  getActiveInbox,
  inboundDomain,
  inboxAddress,
} from '@/server/helpers/inbound-email/inbox';
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
  disconnect: protectedProcedure.mutation(({ ctx }) =>
    ctx.db.transaction(async (tx) => {
      await lockUser(tx, INBOX_LOCK, ctx.user.id);
      await revokeActive(tx, ctx.user.id);
      await tx.delete(inboundEmails).where(eq(inboundEmails.userId, ctx.user.id));
    }),
  ),
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
      })
      .from(inboundEmails)
      .where(eq(inboundEmails.userId, ctx.user.id))
      .orderBy(desc(inboundEmails.receivedAt))
      .limit(RECENT_EMAILS),
  ),
});
