import { z } from 'zod';

import { getTimezone } from '@/lib/date';
import { claimedStatementIds } from '@/server/helpers/chart-scope';
import {
  sumAccountSummaries,
  sumFriendSummaries,
  getAccountsSummaryBetweenDates,
  getFriendsSummaryBetweenDates,
  getRawDataForAggregation,
  processAggregatedData,
} from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  accountSummarySchema,
  aggregatedAccountTransferSummarySchema,
  aggregatedFriendTransferSummarySchema,
  dateSchema,
  DateTruncEnum,
  friendSummarySchema,
} from '@/types';

export const summaryRouter = createTRPCRouter({
  getSummary: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/summary',
      },
    })
    .input(z.object({ ...dateSchema }))
    .output(
      z.object({
        myExpensesTotal: z.number(),
        accountsSummaryData: z.array(accountSummarySchema),
        friendsSummaryData: z.array(friendSummarySchema),
        aggregatedAccountsSummaryData: aggregatedAccountTransferSummarySchema,
        aggregatedFriendsSummaryData: aggregatedFriendTransferSummarySchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountsSummaryData = await getAccountsSummaryBetweenDates(
        ctx.db,
        ctx.user.id,
        input.start,
        input.end,
      );
      const friendsSummaryData = await getFriendsSummaryBetweenDates(
        ctx.db,
        ctx.user.id,
        input.start,
        input.end,
      );
      const aggregatedAccountsSummaryData = sumAccountSummaries(accountsSummaryData);
      const aggregatedFriendsSummaryData = sumFriendSummaries(friendsSummaryData);
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
        budgetLineId: z.string().optional(),
        ...dateSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const tz = await getTimezone();
      const onlyStatementIds =
        input.budgetLineId === undefined
          ? undefined
          : await claimedStatementIds(
              ctx.db,
              ctx.user.id,
              input.budgetLineId,
              input.start,
              input.end,
            );
      const rawData = await getRawDataForAggregation(
        ctx.db,
        ctx.user.id,
        input.aggregateBy,
        tz,
        input.start,
        input.end,
        onlyStatementIds,
      );
      const processedAggregations = processAggregatedData(rawData);
      const aggregatedAccountsSummaryData = sumAccountSummaries(rawData.accountsSummary);
      const aggregatedFriendsSummaryData = sumFriendSummaries(rawData.friendsSummary);
      const myExpensesTotal =
        aggregatedAccountsSummaryData.expenses +
        aggregatedFriendsSummaryData.paidByFriend -
        aggregatedFriendsSummaryData.splits;
      return {
        accountsSummary: rawData.accountsSummary,
        friendsSummary: rawData.friendsSummary,
        ...processedAggregations,
        myExpensesTotal,
        aggregatedAccountsSummaryData,
        aggregatedFriendsSummaryData,
      };
    }),
});
