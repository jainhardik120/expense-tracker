import { addMonths, differenceInCalendarDays } from 'date-fns';
import { and, asc, eq, max } from 'drizzle-orm';
import { z } from 'zod';

import { budgetIncomeLines, budgetLines, budgetYears } from '@/db/schema';
import { cycleAllowance, monthsBetween, project } from '@/lib/budget-projection';
import { matchesRule } from '@/lib/budget-rules';
import { type Database } from '@/lib/db';
import {
  expenseLineOptions,
  getScheduledTotals,
  getStatementsInWindow,
  parseRule,
  cycleKeyFor,
  spentOnDiscretionary,
  summariseByCycle,
  summariseIncome,
  summariseLines,
} from '@/server/helpers/budget';
import { getPendingIncome } from '@/server/helpers/pending-income';
import { getPendingSmsEstimate } from '@/server/helpers/sms-estimate';
import {
  getAccountsSummaryBetweenDates,
  getFriendsSummaryBetweenDates,
} from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  budgetIncomeLineSchema,
  budgetLineSchema,
  budgetRuleSchema,
  budgetYearSchema,
} from '@/types/budget';

const SAMPLE_STATEMENT_LIMIT = 10;

const YEAR_NOT_FOUND = 'Budget year not found';

const selectOwnedYear = (db: Database, userId: string, budgetYearId: string) =>
  db
    .select()
    .from(budgetYears)
    .where(and(eq(budgetYears.id, budgetYearId), eq(budgetYears.userId, userId)))
    .$dynamic();

const requireYear = <T>(rows: T[]): T => {
  if (rows.length === 0) {
    throw new Error(YEAR_NOT_FOUND);
  }
  return rows[0];
};

const assertOwnedYear = async (db: Database, userId: string, budgetYearId: string) =>
  requireYear(await selectOwnedYear(db, userId, budgetYearId));

const lockOwnedYear = async (db: Database, userId: string, budgetYearId: string) =>
  requireYear(await selectOwnedYear(db, userId, budgetYearId).for('update'));

const latestYear = async (db: Database, userId: string) => {
  const years = await db
    .select()
    .from(budgetYears)
    .where(eq(budgetYears.userId, userId))
    .orderBy(asc(budgetYears.startDate));
  return years.at(-1) ?? null;
};

export const budgetRouter = createTRPCRouter({
  getExpenseLines: protectedProcedure.query(async ({ ctx }) => {
    const year = await latestYear(ctx.db, ctx.user.id);
    if (year === null) {
      return [];
    }
    const lines = await ctx.db
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.budgetYearId, year.id));
    return expenseLineOptions(lines);
  }),

  getYears: protectedProcedure.query(async ({ ctx }) =>
    ctx.db
      .select()
      .from(budgetYears)
      .where(eq(budgetYears.userId, ctx.user.id))
      .orderBy(asc(budgetYears.startDate)),
  ),

  createYear: protectedProcedure.input(budgetYearSchema).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(budgetYears)
      .values({ ...input, userId: ctx.user.id })
      .returning();
    return created;
  }),

  updateYear: protectedProcedure
    .input(budgetYearSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.id);
      const { id, ...rest } = input;
      await ctx.db.update(budgetYears).set(rest).where(eq(budgetYears.id, id));
    }),

  deleteYear: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.id);
      await ctx.db.delete(budgetYears).where(eq(budgetYears.id, input.id));
    }),

  getYearDetail: protectedProcedure
    .input(z.object({ budgetYearId: z.string() }))
    .query(async ({ ctx, input }) => {
      const year = await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      const lines = await ctx.db
        .select()
        .from(budgetLines)
        .where(eq(budgetLines.budgetYearId, year.id))
        .orderBy(asc(budgetLines.position));
      const incomeLines = await ctx.db
        .select()
        .from(budgetIncomeLines)
        .where(eq(budgetIncomeLines.budgetYearId, year.id))
        .orderBy(asc(budgetIncomeLines.position));
      const scoped = await getStatementsInWindow(ctx.db, ctx.user.id, year.startDate, year.endDate);
      const { totals, unclaimed } = summariseLines(lines, scoped);
      const now = new Date();
      const pending = await getPendingIncome(
        ctx.db,
        ctx.user.id,
        now,
        year.endDate > now ? year.endDate : now,
      );
      const income = summariseIncome(incomeLines, scoped, pending);
      const totalMonths = monthsBetween(year.startDate, year.endDate);

      const accountsSummary = await getAccountsSummaryBetweenDates(ctx.db, ctx.user.id);
      const friendsSummary = await getFriendsSummaryBetweenDates(ctx.db, ctx.user.id);
      const inAccounts = accountsSummary.reduce((sum, a) => sum + a.finalBalance, 0);
      const owedToFriends = friendsSummary.reduce((sum, f) => sum + f.finalBalance, 0);
      const balanceToday = inAccounts - owedToFriends;

      const openingAccounts = await getAccountsSummaryBetweenDates(
        ctx.db,
        ctx.user.id,
        undefined,
        year.startDate,
      );
      const openingFriends = await getFriendsSummaryBetweenDates(
        ctx.db,
        ctx.user.id,
        undefined,
        year.startDate,
      );
      const openingBalance =
        openingAccounts.reduce((sum, a) => sum + a.finalBalance, 0) -
        openingFriends.reduce((sum, f) => sum + f.finalBalance, 0);

      const cyclesTotal = Math.round(totalMonths);
      const incomeCyclesRemaining = pending.payments;
      const cyclesElapsed = Math.max(cyclesTotal - incomeCyclesRemaining, 0);
      const monthsRemaining = Math.max(
        monthsBetween(now, year.endDate > now ? year.endDate : now),
        0,
      );

      const earmarkedIncome = new Map(income.earmarked);
      const openingIsEarmarked = year.openingBalanceLineId !== null;
      if (year.openingBalanceLineId !== null) {
        earmarkedIncome.set(
          year.openingBalanceLineId,
          (earmarkedIncome.get(year.openingBalanceLineId) ?? 0) + openingBalance,
        );
      }

      const pendingSms = await getPendingSmsEstimate(ctx.db, ctx.user.id);

      const scheduled = await getScheduledTotals(
        ctx.db,
        ctx.user.id,
        lines,
        scoped,
        year.startDate,
        year.endDate,
        now,
      );

      const projection = project(
        totals.map((line) => ({
          lineId: line.lineId,
          name: line.name,
          allocationKind: line.allocationKind,
          allocationAmount: line.allocationAmount,
          discretionary: line.discretionary,
          closed: line.closed,
          actual: line.actual,
          earmarkedIncome: earmarkedIncome.get(line.lineId) ?? 0,
          scheduled: scheduled.get(line.lineId) ?? { year: 0, toDate: 0, remaining: 0 },
          pacePerMonth: cyclesElapsed > 0 ? line.actual / cyclesElapsed : 0,
        })),
        income.waterfall,
        cyclesElapsed,
        cyclesTotal,
        openingIsEarmarked ? 0 : openingBalance,
        monthsRemaining,
        pendingSms.totalSpend,
        income.pendingWaterfall,
      );
      const cycles = summariseByCycle(lines, scoped, year.startDate.getDate());
      const openCycle = cycleKeyFor(now, year.startDate.getDate());
      const spentThisCycle = spentOnDiscretionary(
        cycles.find((row) => row.cycle === openCycle),
        lines,
      );
      const cycleStartDay = year.startDate.getDate();
      const [cycleYear, cycleMonth] = openCycle.split('-').map(Number);
      const cycleStart = new Date(cycleYear, cycleMonth - 1, cycleStartDay);
      const nextCycle = addMonths(cycleStart, 1);
      const cycleEnd = nextCycle < year.endDate ? nextCycle : year.endDate;
      const daysLeft = Math.max(differenceInCalendarDays(cycleEnd, now), 0);
      const thisCycle = {
        key: openCycle,
        endsOn: cycleEnd,
        daysLeft,
        recorded: spentThisCycle,
        ...cycleAllowance({
          affordable: projection.affordable,
          spent: spentThisCycle + pendingSms.totalSpend,
          monthsFromCycleStart: monthsBetween(cycleStart, year.endDate),
          cycleMonths: monthsBetween(cycleStart, cycleEnd),
          daysLeftInCycle: daysLeft,
          daysInCycle: differenceInCalendarDays(cycleEnd, cycleStart),
        }),
      };

      return {
        year,
        lines,
        incomeLines,
        totals,
        projection,
        balanceToday,
        balanceParts: { inAccounts, owedToFriends },
        pendingSpend: pendingSms.totalSpend,
        pendingCount: pendingSms.count,
        openingBalance,
        incomeCyclesRemaining,
        pendingIncome: pending,
        pendingCounted: income.pendingCounted,
        pendingByLine: Object.fromEntries(income.pendingByLine),
        cycles,
        thisCycle,
        unclaimedCount: unclaimed.length,
        unclaimedTotal: unclaimed.reduce((sum, s) => sum + s.myAmount, 0),
      };
    }),

  addLine: protectedProcedure
    .input(budgetLineSchema.extend({ budgetYearId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockOwnedYear(tx, ctx.user.id, input.budgetYearId);
        const [{ last }] = await tx
          .select({ last: max(budgetLines.position) })
          .from(budgetLines)
          .where(eq(budgetLines.budgetYearId, input.budgetYearId));
        const [created] = await tx
          .insert(budgetLines)
          .values({ ...input, position: (last ?? -1) + 1 })
          .returning();
        return created;
      }),
    ),

  updateLine: protectedProcedure
    .input(budgetLineSchema.extend({ id: z.string(), budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      const { id, budgetYearId, ...rest } = input;
      await ctx.db
        .update(budgetLines)
        .set(rest)
        .where(and(eq(budgetLines.id, id), eq(budgetLines.budgetYearId, budgetYearId)));
    }),

  deleteLine: protectedProcedure
    .input(z.object({ id: z.string(), budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      await ctx.db
        .delete(budgetLines)
        .where(and(eq(budgetLines.id, input.id), eq(budgetLines.budgetYearId, input.budgetYearId)));
    }),

  reorderLines: protectedProcedure
    .input(z.object({ budgetYearId: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      await ctx.db.transaction(async (tx) => {
        for (const [position, id] of input.orderedIds.entries()) {
          await tx
            .update(budgetLines)
            .set({ position })
            .where(and(eq(budgetLines.id, id), eq(budgetLines.budgetYearId, input.budgetYearId)));
        }
      });
    }),

  addIncomeLine: protectedProcedure
    .input(budgetIncomeLineSchema.extend({ budgetYearId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockOwnedYear(tx, ctx.user.id, input.budgetYearId);
        const [{ last }] = await tx
          .select({ last: max(budgetIncomeLines.position) })
          .from(budgetIncomeLines)
          .where(eq(budgetIncomeLines.budgetYearId, input.budgetYearId));
        const [created] = await tx
          .insert(budgetIncomeLines)
          .values({ ...input, position: (last ?? -1) + 1 })
          .returning();
        return created;
      }),
    ),

  updateIncomeLine: protectedProcedure
    .input(budgetIncomeLineSchema.extend({ id: z.string(), budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      const { id, budgetYearId, ...rest } = input;
      await ctx.db
        .update(budgetIncomeLines)
        .set(rest)
        .where(and(eq(budgetIncomeLines.id, id), eq(budgetIncomeLines.budgetYearId, budgetYearId)));
    }),

  reorderIncomeLines: protectedProcedure
    .input(z.object({ budgetYearId: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      await ctx.db.transaction(async (tx) => {
        for (const [position, id] of input.orderedIds.entries()) {
          await tx
            .update(budgetIncomeLines)
            .set({ position })
            .where(
              and(
                eq(budgetIncomeLines.id, id),
                eq(budgetIncomeLines.budgetYearId, input.budgetYearId),
              ),
            );
        }
      });
    }),

  deleteIncomeLine: protectedProcedure
    .input(z.object({ id: z.string(), budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      await ctx.db
        .delete(budgetIncomeLines)
        .where(
          and(
            eq(budgetIncomeLines.id, input.id),
            eq(budgetIncomeLines.budgetYearId, input.budgetYearId),
          ),
        );
    }),

  previewRule: protectedProcedure
    .input(z.object({ budgetYearId: z.string(), rule: budgetRuleSchema }))
    .query(async ({ ctx, input }) => {
      const year = await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      const scoped = await getStatementsInWindow(ctx.db, ctx.user.id, year.startDate, year.endDate);
      const rule = parseRule(input.rule);
      const matched = scoped.filter((statement) => matchesRule(statement, rule));
      return {
        count: matched.length,
        total: matched.reduce((sum, statement) => sum + statement.myAmount, 0),
        sample: matched
          .toSorted((a, b) => b.myAmount - a.myAmount)
          .slice(0, SAMPLE_STATEMENT_LIMIT)
          .map((s) => ({ id: s.id, category: s.category, tags: s.tags, amount: s.myAmount })),
      };
    }),
});
