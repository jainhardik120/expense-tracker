import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { reportBoundaries } from '@/db/schema';
import { startOfDayLocal, getTimezone } from '@/lib/date';
import { getRawDataForCustomAggregation, processAggregatedData } from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

import { getAccounts, getFriends } from '../helpers/account';
import { parseFloatSafe } from '../helpers/emi-calculations';

const createBoundarySchema = z.object({
  boundaryDate: z.date(),
});

export const reportsRouter = createTRPCRouter({
  getBoundaries: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(reportBoundaries)
      .where(eq(reportBoundaries.userId, ctx.user.id))
      .orderBy(asc(reportBoundaries.boundaryDate));
  }),

  createBoundary: protectedProcedure
    .input(createBoundarySchema)
    .mutation(async ({ ctx, input }) => {
      const tz = await getTimezone();
      const normalizedDate = startOfDayLocal(input.boundaryDate, tz);
      const existing = await ctx.db
        .select()
        .from(reportBoundaries)
        .where(
          and(
            eq(reportBoundaries.userId, ctx.user.id),
            eq(reportBoundaries.boundaryDate, normalizedDate),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new Error('A boundary with this date already exists');
      }
      return ctx.db
        .insert(reportBoundaries)
        .values({
          userId: ctx.user.id,
          boundaryDate: normalizedDate,
        })
        .returning();
    }),

  deleteBoundary: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .delete(reportBoundaries)
        .where(and(eq(reportBoundaries.id, input.id), eq(reportBoundaries.userId, ctx.user.id)))
        .returning();
    }),

  updateBoundary: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        boundaryDate: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tz = await getTimezone();
      const normalizedDate = startOfDayLocal(input.boundaryDate, tz);
      const existing = await ctx.db
        .select()
        .from(reportBoundaries)
        .where(
          and(
            eq(reportBoundaries.userId, ctx.user.id),
            eq(reportBoundaries.boundaryDate, normalizedDate),
          ),
        )
        .limit(1);
      if (existing.length > 0 && existing[0].id !== input.id) {
        throw new Error('A boundary with this date already exists');
      }
      return ctx.db
        .update(reportBoundaries)
        .set({ boundaryDate: normalizedDate })
        .where(and(eq(reportBoundaries.id, input.id), eq(reportBoundaries.userId, ctx.user.id)))
        .returning();
    }),
  getAggregatedReport: protectedProcedure.query(async ({ ctx }) => {
    const rawData = await getRawDataForCustomAggregation(ctx.db, ctx.user.id);
    const friends = await getFriends(ctx.db, ctx.user.id);
    const accounts = await getAccounts(ctx.db, ctx.user.id);
    return processAggregatedData({
      ...rawData,
      friendsSummary: friends.map((friend) => ({
        friend: {
          id: friend.id,
        },
        startingBalance: 0,
      })),
      accountsSummary: accounts.map((account) => ({
        account: {
          id: account.id,
        },
        startingBalance: parseFloatSafe(account.startingBalance),
      })),
    });
  }),
});
