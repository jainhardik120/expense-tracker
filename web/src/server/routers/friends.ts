import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { user } from '@/db/auth-schema';
import { friendInvitations, friendStatementInbox, friendsProfiles } from '@/db/schema';
import FriendInvitationEmail from '@/emails/friend-invitation';
import { getBaseUrl } from '@/lib/get-base-url';
import { sendSESEmail } from '@/lib/send-email';
import { assertOwnsAccountsAndFriends, getFriends } from '@/server/helpers/account';
import { acceptFriendInvitation, resolveInboxEntry } from '@/server/helpers/friend-mirror';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createFriendSchema, inboxResolutionSchema } from '@/types';

export const friendsRouter = createTRPCRouter({
  getFriends: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/friends',
      },
    })
    .input(z.void())
    .output(
      z.array(
        z.object({
          id: z.string(),
          userId: z.string(),
          name: z.string(),
          email: z.string().nullable(),
          linkedUserId: z.string().nullable(),
          linkedProfileId: z.string().nullable(),
          linkedAt: z.date().nullable(),
          createdAt: z.date().nullable(),
        }),
      ),
    )
    .query(({ ctx }) => {
      return getFriends(ctx.db, ctx.user.id);
    }),
  createFriend: protectedProcedure.input(createFriendSchema).mutation(({ ctx, input }) => {
    return ctx.db
      .insert(friendsProfiles)
      .values({
        userId: ctx.user.id,
        ...input,
      })
      .returning({ id: friendsProfiles.id });
  }),
  deleteFriend: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(friendsProfiles)
        .where(and(eq(friendsProfiles.id, input.id), eq(friendsProfiles.userId, ctx.user.id)));
    }),
  updateFriend: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        createFriendSchema,
      }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db
        .update(friendsProfiles)
        .set(input.createFriendSchema)
        .where(and(eq(friendsProfiles.id, input.id), eq(friendsProfiles.userId, ctx.user.id)))
        .returning({ id: friendsProfiles.id });
    }),
  getInvitations: protectedProcedure.query(async ({ ctx }) => {
    const [incoming, outgoing] = await Promise.all([
      ctx.db
        .select({
          id: friendInvitations.id,
          inviterName: user.name,
          inviterEmail: user.email,
          createdAt: friendInvitations.createdAt,
        })
        .from(friendInvitations)
        .innerJoin(user, eq(user.id, friendInvitations.inviterUserId))
        .where(
          and(
            eq(friendInvitations.email, ctx.user.email.toLowerCase()),
            eq(friendInvitations.status, 'pending'),
            ne(friendInvitations.inviterUserId, ctx.user.id),
          ),
        )
        .orderBy(desc(friendInvitations.createdAt)),
      ctx.db
        .select({
          id: friendInvitations.id,
          friendId: friendInvitations.friendId,
          email: friendInvitations.email,
          createdAt: friendInvitations.createdAt,
        })
        .from(friendInvitations)
        .where(
          and(
            eq(friendInvitations.inviterUserId, ctx.user.id),
            eq(friendInvitations.status, 'pending'),
          ),
        ),
    ]);
    return { incoming, outgoing, canAccept: ctx.user.emailVerified };
  }),
  inviteFriend: protectedProcedure
    .input(z.object({ friendId: z.uuid(), email: z.string().trim().toLowerCase().pipe(z.email()) }))
    .mutation(async ({ ctx, input }) => {
      if (input.email === ctx.user.email.toLowerCase()) {
        throw new Error('That is your own email address');
      }
      const invitation = await ctx.db.transaction(async (tx) => {
        const friend = (
          await tx
            .select({ linkedUserId: friendsProfiles.linkedUserId })
            .from(friendsProfiles)
            .where(
              and(eq(friendsProfiles.id, input.friendId), eq(friendsProfiles.userId, ctx.user.id)),
            )
            .limit(1)
            .for('update')
        ).at(0);
        if (friend === undefined) {
          throw new Error('Friend not found');
        }
        if (friend.linkedUserId !== null) {
          throw new Error('This friend is already connected to an account');
        }
        await tx
          .update(friendInvitations)
          .set({ status: 'revoked', respondedAt: new Date() })
          .where(
            and(
              eq(friendInvitations.friendId, input.friendId),
              eq(friendInvitations.status, 'pending'),
            ),
          );
        await tx
          .update(friendsProfiles)
          .set({ email: input.email })
          .where(eq(friendsProfiles.id, input.friendId));
        const created = await tx
          .insert(friendInvitations)
          .values({ inviterUserId: ctx.user.id, friendId: input.friendId, email: input.email })
          .returning({ id: friendInvitations.id });
        return created[0];
      });
      const emailSent = await sendSESEmail(
        [input.email],
        `${ctx.user.name} wants to share expenses with you`,
        FriendInvitationEmail({
          inviterName: ctx.user.name,
          inviterEmail: ctx.user.email,
          acceptLink: `${getBaseUrl()}/auth/login?redirect=/friends`,
        }),
      ).then(
        () => true,
        () => false,
      );
      return { id: invitation.id, emailSent };
    }),
  revokeInvitation: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(friendInvitations)
        .set({ status: 'revoked', respondedAt: new Date() })
        .where(
          and(
            eq(friendInvitations.id, input.id),
            eq(friendInvitations.inviterUserId, ctx.user.id),
            eq(friendInvitations.status, 'pending'),
          ),
        );
    }),
  declineInvitation: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(friendInvitations)
        .set({ status: 'declined', respondedAt: new Date() })
        .where(
          and(
            eq(friendInvitations.id, input.id),
            eq(friendInvitations.email, ctx.user.email.toLowerCase()),
            eq(friendInvitations.status, 'pending'),
          ),
        );
    }),
  acceptInvitation: protectedProcedure
    .input(z.object({ id: z.uuid(), friendId: z.uuid().nullable() }))
    .mutation(({ ctx, input }) => {
      if (!ctx.user.emailVerified) {
        throw new Error('Verify your email address before accepting an invitation');
      }
      return ctx.db.transaction((tx) =>
        acceptFriendInvitation(tx, ctx.user, input.id, input.friendId),
      );
    }),
  getInbox: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: friendStatementInbox.id,
        friendId: friendStatementInbox.friendId,
        friendName: friendsProfiles.name,
        amount: friendStatementInbox.amount,
        category: friendStatementInbox.category,
        tags: friendStatementInbox.tags,
        occurredAt: friendStatementInbox.occurredAt,
      })
      .from(friendStatementInbox)
      .innerJoin(friendsProfiles, eq(friendsProfiles.id, friendStatementInbox.friendId))
      .where(
        and(
          eq(friendStatementInbox.userId, ctx.user.id),
          eq(friendStatementInbox.status, 'pending'),
        ),
      )
      .orderBy(desc(friendStatementInbox.occurredAt));
    return rows.map((row) => ({ ...row, amount: (-Number(row.amount)).toString() }));
  }),
  resolveInboxEntries: protectedProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(1), resolution: inboxResolutionSchema }))
    .mutation(async ({ ctx, input }) => {
      const { resolution } = input;
      if (resolution.type === 'account') {
        await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, {
          accountIds: [resolution.accountId],
        });
      }
      return ctx.db.transaction(async (tx) => {
        for (const id of input.ids) {
          await resolveInboxEntry(tx, ctx.user.id, id, resolution);
        }
        return { resolved: input.ids.length };
      });
    }),
});
