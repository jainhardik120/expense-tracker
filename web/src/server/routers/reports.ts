import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { reportBoundaries } from '@/db/schema';
import { startOfDayLocal, getTimezone } from '@/lib/date';
import {
  getAccountsSummaryBetweenDates,
  getFriendsSummaryBetweenDates,
  addAccountsSummary,
  addFriendsSummary,
} from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  aggregatedAccountTransferSummarySchema,
  aggregatedFriendTransferSummarySchema,
} from '@/types';

const createBoundarySchema = z.object({
  boundaryDate: z.date(),
});

const bucketSummarySchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
  accountsSummary: aggregatedAccountTransferSummarySchema,
  friendsSummary: aggregatedFriendTransferSummarySchema,
  myExpensesTotal: z.number(),
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

      // Check for duplicate boundaries
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

      // Check for duplicate boundaries (excluding current)
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

  getAggregatedReport: protectedProcedure
    .output(z.array(bucketSummarySchema))
    .query(async ({ ctx }) => {
      // Fetch all boundaries sorted by date
      const boundaries = await ctx.db
        .select()
        .from(reportBoundaries)
        .where(eq(reportBoundaries.userId, ctx.user.id))
        .orderBy(asc(reportBoundaries.boundaryDate));

      if (boundaries.length < 2) {
        // Need at least 2 boundaries to create 1 bucket
        return [];
      }

      // Create buckets from consecutive boundaries
      const buckets: z.infer<typeof bucketSummarySchema>[] = [];

      for (let i = 0; i < boundaries.length - 1; i++) {
        const startDate = boundaries[i].boundaryDate;
        const endDate = boundaries[i + 1].boundaryDate;

        const accountsSummaryData = await getAccountsSummaryBetweenDates(
          ctx.db,
          ctx.user.id,
          startDate,
          endDate,
        );
        const friendsSummaryData = await getFriendsSummaryBetweenDates(
          ctx.db,
          ctx.user.id,
          startDate,
          endDate,
        );

        const accountsSummary = addAccountsSummary(accountsSummaryData);
        const friendsSummary = addFriendsSummary(friendsSummaryData);
        const myExpensesTotal =
          accountsSummary.expenses + friendsSummary.paidByFriend - friendsSummary.splits;

        buckets.push({
          startDate,
          endDate,
          accountsSummary,
          friendsSummary,
          myExpensesTotal,
        });
      }

      return buckets;
    }),
});
