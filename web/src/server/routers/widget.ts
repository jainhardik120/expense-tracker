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

/**
 * The figure the budget page divides a month's allowance by, kept identical so
 * the widget and the page never disagree about what a day is worth.
 */
const DAYS_PER_MONTH = 30.4;

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

/**
 * Which budget cycle a date falls in, by the same rule the budget page uses:
 * a cycle opens on the day of the month the budget year started, so the days
 * before that belong to the cycle that opened last month.
 */
const cycleKeyFor = (date: Date, cycleStartDay: number) => {
  const shifted = new Date(date);
  if (shifted.getDate() < cycleStartDay) {
    shifted.setMonth(shifted.getMonth() - 1);
  }
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

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
              const perMonth = detail.projection.safeToSpendPerMonth;
              const discretionary = new Set(
                detail.lines.filter((line) => line.discretionary).map((line) => line.name),
              );
              const cycle = detail.cycles.find(
                (row) => row.cycle === cycleKeyFor(now, year.startDate.getDate()),
              );
              const spentThisCycle = Object.entries(cycle?.perLine ?? {}).reduce(
                (sum, [name, amount]) => (discretionary.has(name) ? sum + amount : sum),
                0,
              );
              return {
                perDay: perMonth / DAYS_PER_MONTH,
                perMonth,
                remainingThisMonth: perMonth - spentThisCycle,
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
