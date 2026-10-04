import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

import { budgetYears } from '@/db/schema';
import { getPendingSmsEstimate } from '@/server/helpers/sms-estimate';
import { createCallerFactory, createTRPCRouter, protectedProcedure } from '@/server/trpc';

import { budgetRouter } from './budget';
import { summaryRouter } from './summary';

const callBudget = createCallerFactory(budgetRouter);
const callSummary = createCallerFactory(summaryRouter);

const widgetSchema = z.object({
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
