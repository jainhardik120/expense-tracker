import { z } from 'zod';

import {
  addAccountsSummary,
  addFriendsSummary,
  getAccountsSummaryBetweenDates,
  getFriendsSummaryBetweenDates,
  getRawDataForAggregation,
  processAggregatedData,
} from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { DateTruncEnum } from '@/types';

export const summaryRouter = createTRPCRouter({
  getSummary: protectedProcedure
    .input(z.object({ start: z.date().optional(), end: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      const accountsSummaryData = await getAccountsSummaryBetweenDates(
        ctx.db,
        ctx.session.user.id,
        input.start,
        input.end,
      );
      const friendsSummaryData = await getFriendsSummaryBetweenDates(
        ctx.db,
        ctx.session.user.id,
        input.start,
        input.end,
      );
      const aggregatedAccountsSummaryData = addAccountsSummary(accountsSummaryData);
      const aggregatedFriendsSummaryData = addFriendsSummary(friendsSummaryData);
      const myExpensesTotal =
        aggregatedAccountsSummaryData.expenses +
        aggregatedFriendsSummaryData.paidByFriend -
        aggregatedFriendsSummaryData.splits;
      return {
        accountsSummaryData,
        friendsSummaryData,
        myExpensesTotal,
        aggregatedAccountsSummaryData,
        aggregatedFriendsSummaryData,
      };
    }),
  getAggregatedData: protectedProcedure
    .input(
      z.object({
        aggregateBy: DateTruncEnum,
        start: z.date().optional(),
        end: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rawData = await getRawDataForAggregation(
        ctx.db,
        ctx.session.user.id,
        input.aggregateBy,
        input.start,
        input.end,
      );
      const processedAggregations = processAggregatedData(rawData);
      return {
        accountsSummary: rawData.accountsSummary,
        friendsSummary: rawData.friendsSummary,
        processedAggregations,
      };
    }),
});
