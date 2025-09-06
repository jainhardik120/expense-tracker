import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { friendsProfiles } from '@/db/schema';
import { getFriends } from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createFriendSchema } from '@/types';

export const friendsRouter = createTRPCRouter({
  getFriends: protectedProcedure.query(({ ctx }) => {
    return getFriends(ctx.db, ctx.session.user.id);
  }),
  createFriend: protectedProcedure.input(createFriendSchema).mutation(({ ctx, input }) => {
    return ctx.db
      .insert(friendsProfiles)
      .values({
        userId: ctx.session.user.id,
        ...input,
      })
      .returning({ id: friendsProfiles.id });
  }),
  deleteFriend: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(friendsProfiles)
        .where(
          and(eq(friendsProfiles.id, input.id), eq(friendsProfiles.userId, ctx.session.user.id)),
        );
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
        .where(
          and(eq(friendsProfiles.id, input.id), eq(friendsProfiles.userId, ctx.session.user.id)),
        )
        .returning({ id: friendsProfiles.id });
    }),
});
