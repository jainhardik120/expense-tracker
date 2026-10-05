import {
  and,
  asc,
  count as countRows,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { alias, type PgSelect } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { user } from '@/db/auth-schema';
import {
  bankAccount,
  friendInvitations,
  friendsProfiles,
  sharedAnswers,
  statements,
} from '@/db/schema';
import FriendInvitationEmail from '@/emails/friend-invitation';
import { getBaseUrl } from '@/lib/get-base-url';
import { sendSESEmail } from '@/lib/send-email';
import { assertOwnsAccountsAndFriends, getFriends } from '@/server/helpers/account';
import {
  acceptFriendInvitation,
  answerReviewEntries,
  needsAnAnswer,
  reopenReviewEntries,
  updateSharedStatement,
} from '@/server/helpers/friend-sharing';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  createFriendSchema,
  friendInboxListSchema,
  inboxResolutionSchema,
  sharedStatementUpdateSchema,
} from '@/types';

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
    .mutation(async ({ ctx, input }) => {
      const friend = (
        await ctx.db
          .select({ linkedUserId: friendsProfiles.linkedUserId })
          .from(friendsProfiles)
          .where(and(eq(friendsProfiles.id, input.id), eq(friendsProfiles.userId, ctx.user.id)))
          .limit(1)
      ).at(0);
      if (friend?.linkedUserId != null) {
        throw new Error('A friend connected to an account cannot be removed');
      }
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
  getInbox: protectedProcedure.input(friendInboxListSchema).query(async ({ ctx, input }) => {
    const mine = alias(friendsProfiles, 'mine');
    const statusConditions = input.status.map((status) =>
      status === 'pending'
        ? sql`${sharedAnswers.status} IS NULL`
        : eq(sharedAnswers.status, status),
    );
    const conditions = [
      eq(friendsProfiles.linkedUserId, ctx.user.id),
      needsAnAnswer,
      statusConditions.length > 0 ? or(...statusConditions) : undefined,
      input.friend.length > 0 ? inArray(mine.id, input.friend) : undefined,
      input.start === undefined ? undefined : gte(statements.createdAt, input.start),
      input.end === undefined ? undefined : lte(statements.createdAt, input.end),
    ];
    const ordering = input.sort.map(({ id, desc: descending }) => {
      if (id === 'amount') {
        return descending ? asc(statements.amount) : desc(statements.amount);
      }
      return descending ? desc(statements.createdAt) : asc(statements.createdAt);
    });
    const fromReview = <T extends PgSelect>(query: T) =>
      query
        .innerJoin(friendsProfiles, eq(friendsProfiles.id, statements.friendId))
        .innerJoin(mine, eq(mine.id, friendsProfiles.linkedProfileId))
        .leftJoin(
          sharedAnswers,
          and(
            eq(sharedAnswers.statementId, statements.id),
            eq(sharedAnswers.viewerUserId, ctx.user.id),
          ),
        )
        .leftJoin(bankAccount, eq(bankAccount.id, sharedAnswers.accountId))
        .where(and(...conditions));
    const [[{ count }], rows] = await Promise.all([
      fromReview(ctx.db.select({ count: countRows() }).from(statements).$dynamic()),
      fromReview(
        ctx.db
          .select({
            id: statements.id,
            friendId: mine.id,
            friendName: mine.name,
            amount: statements.amount,
            category: statements.category,
            tags: statements.tags,
            occurredAt: statements.createdAt,
            originKind: statements.statementKind,
            status: sharedAnswers.status,
            resolvedAt: sharedAnswers.answeredAt,
            resolvedKind: sharedAnswers.asKind,
            resolvedCategory: sharedAnswers.category,
            resolvedAccountName: bankAccount.accountName,
          })
          .from(statements)
          .$dynamic(),
      )
        .orderBy(
          ...(ordering.length > 0 ? ordering : [desc(statements.createdAt)]),
          asc(statements.id),
        )
        .limit(input.perPage)
        .offset((input.page - 1) * input.perPage),
    ]);
    return {
      entries: rows.map(({ originKind, status, ...row }) => ({
        ...row,
        status: status ?? ('pending' as const),
        kind: originKind === 'expense' ? ('paid' as const) : ('transfer' as const),
        amount: (-Number(row.amount)).toString(),
      })),
      pageCount: Math.ceil(count / input.perPage),
      rowsCount: count,
    };
  }),
  reopenInboxEntries: protectedProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(1) }))
    .mutation(({ ctx, input }) => reopenReviewEntries(ctx.db, ctx.user.id, input.ids)),
  resolveInboxEntries: protectedProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(1), resolution: inboxResolutionSchema }))
    .mutation(async ({ ctx, input }) => {
      const { resolution } = input;
      if (resolution.type === 'account') {
        await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, {
          accountIds: [resolution.accountId],
        });
      }
      return ctx.db.transaction((tx) =>
        answerReviewEntries(tx, ctx.user.id, input.ids, resolution),
      );
    }),
  updateSharedStatement: protectedProcedure
    .input(sharedStatementUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.accountId !== undefined && input.accountId !== null) {
        await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, { accountIds: [input.accountId] });
      }
      return updateSharedStatement(ctx.db, ctx.user.id, input);
    }),
});
