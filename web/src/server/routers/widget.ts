import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

import { budgetYears } from '@/db/schema';
import { getPendingSmsEstimate } from '@/server/helpers/sms-estimate';
import { createCallerFactory, createTRPCRouter, protectedProcedure } from '@/server/trpc';

import { budgetRouter } from './budget';
import { summaryRouter } from './summary';

// Callers for the two routers this one reads from, rather than a caller for
// the whole app: importing the root router from one of its own children is a
// cycle, and TypeScript answers a cycle by inferring `any` everywhere.
const callBudget = createCallerFactory(budgetRouter);
const callSummary = createCallerFactory(summaryRouter);

const widgetSchema = z.object({
  /** Accounts less friends: the money that is actually mine. */
  balance: z.number(),
  spentToday: z.number(),
  pending: z.object({ count: z.number(), amount: z.number() }),
  budget: z
    .object({
      perDay: z.number(),
      perMonth: z.number(),
      remainingThisMonth: z.number(),
      goal: z.number(),
    })
    .nullable(),
  asOf: z.date(),
});

export const widgetRouter = createTRPCRouter({
  /**
   * Everything a home-screen widget shows, in one request.
   *
   * A widget refreshes on a timer in the background, so it gets one call and
   * one round trip rather than four. `dayStart` and `dayEnd` are the phone's
   * idea of today — a day that begins at 6am, say, so a late supper is counted
   * against the evening it was eaten in.
   */
  get: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/widget',
      },
    })
    .input(z.object({ dayStart: z.date().optional(), dayEnd: z.date().optional() }))
    .output(widgetSchema)
    .query(async ({ ctx, input }) => {
      const budgetCaller = callBudget(ctx);
      const summaryCaller = callSummary(ctx);

      const now = new Date();
      const [summary, pending, years] = await Promise.all([
        // The window bounds the spending; the balances it returns are as at
        // its end, which is now.
        summaryCaller.getSummary({ start: input.dayStart, end: input.dayEnd ?? now }),
        getPendingSmsEstimate(ctx.db, ctx.user.id),
        ctx.db
          .select()
          .from(budgetYears)
          .where(
            and(
              eq(budgetYears.userId, ctx.user.id),
              lte(budgetYears.startDate, now),
              gte(budgetYears.endDate, now),
            ),
          )
          .orderBy(asc(budgetYears.startDate))
          .limit(1),
      ]);

      const year = years.at(0);
      const budget =
        year === undefined
          ? null
          : await (async () => {
              const detail = await budgetCaller.getYearDetail({ budgetYearId: year.id });
              // Taken whole from the detail rather than worked out again here,
              // so the tile and the budget page always agree. The day figure is
              // what is left of this cycle over its days, not the month's
              // average: it is the one that says how to spend today.
              return {
                perDay: detail.thisCycle.perDay,
                perMonth: detail.thisCycle.perMonth,
                remainingThisMonth: detail.thisCycle.remaining,
                goal: detail.projection.goal,
              };
            })();

      return {
        balance:
          summary.aggregatedAccountsSummaryData.finalBalance -
          summary.aggregatedFriendsSummaryData.finalBalance,
        spentToday: summary.myExpensesTotal,
        pending: { count: pending.count, amount: pending.totalSpend },
        budget,
        asOf: now,
      };
    }),
});
