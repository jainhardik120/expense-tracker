import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { budgetIncomeLines, budgetLines, budgetYears } from '@/db/schema';
import { monthsBetween, project } from '@/lib/budget-projection';
import { matchesRule } from '@/lib/budget-rules';
import {
  getScheduledTotals,
  getStatementsInWindow,
  parseRule,
  summariseByCycle,
  summariseIncome,
  summariseLines,
} from '@/server/helpers/budget';
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

const YEAR_NOT_FOUND = 'Budget year not found';

/** Every mutation goes through this: a year id from the client is not trusted. */
const assertOwnedYear = async (
  db: Parameters<typeof getStatementsInWindow>[0],
  userId: string,
  budgetYearId: string,
) => {
  const found = await db
    .select()
    .from(budgetYears)
    .where(and(eq(budgetYears.id, budgetYearId), eq(budgetYears.userId, userId)));
  if (found.length === 0) {
    throw new Error(YEAR_NOT_FOUND);
  }
  return found[0];
};

export const budgetRouter = createTRPCRouter({
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

  /** The year with its lines, and what each line has actually claimed so far. */
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
      const income = summariseIncome(incomeLines, scoped);
      const now = new Date();
      const totalMonths = monthsBetween(year.startDate, year.endDate);

      // --- the cash outlook: what is left, and what it means for investing ---
      const accountsSummary = await getAccountsSummaryBetweenDates(ctx.db, ctx.user.id);
      const friendsSummary = await getFriendsSummaryBetweenDates(ctx.db, ctx.user.id);
      const balanceToday =
        accountsSummary.reduce((sum, a) => sum + a.finalBalance, 0) -
        friendsSummary.reduce((sum, f) => sum + f.finalBalance, 0);

      // What the year opened with, read rather than typed: last year's residual
      // is money already earned and kept, and this year is free to spend it.
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

      // Pay cycles, not calendar months. The first salary of the year can land on
      // day one, so after nine calendar months ten have been paid -- and it is the
      // count of those, not the elapsed time, that says how many are still coming.
      const cyclesTotal = Math.round(totalMonths);
      const cyclesElapsed = Math.min(income.waterfallCount, cyclesTotal);
      const incomeCyclesRemaining = Math.max(cyclesTotal - cyclesElapsed, 0);
      // Months still to be spent in, which is a different count: the last salary
      // of the year can arrive well before the year is over.
      const monthsRemaining = Math.max(
        monthsBetween(now, year.endDate > now ? year.endDate : now),
        0,
      );

      // Last year's leftover is income like any other. Pointed at a line it funds
      // that line alone, so a shortfall against it is visible; otherwise it joins
      // the general pot. Either way it is counted exactly once.
      const earmarkedIncome = new Map(income.earmarked);
      const openingIsEarmarked = year.openingBalanceLineId !== null;
      if (year.openingBalanceLineId !== null) {
        earmarkedIncome.set(
          year.openingBalanceLineId,
          (earmarkedIncome.get(year.openingBalanceLineId) ?? 0) + openingBalance,
        );
      }

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
      );
      return {
        year,
        lines,
        incomeLines,
        totals,
        projection,
        // Cash facts for context; every projection comes from `projection`.
        balanceToday,
        openingBalance,
        incomeCyclesRemaining,
        monthlyIncome: cyclesElapsed > 0 ? income.waterfall / cyclesElapsed : 0,
        cycles: summariseByCycle(lines, scoped, year.startDate.getDate()),
        unclaimedCount: unclaimed.length,
        unclaimedTotal: unclaimed.reduce((sum, s) => sum + s.myAmount, 0),
      };
    }),

  addLine: protectedProcedure
    .input(budgetLineSchema.extend({ budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      const existing = await ctx.db
        .select({ position: budgetLines.position })
        .from(budgetLines)
        .where(eq(budgetLines.budgetYearId, input.budgetYearId));
      // New lines go to the bottom, just above wherever the residual sits.
      const position = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;
      const [created] = await ctx.db
        .insert(budgetLines)
        .values({ ...input, position })
        .returning();
      return created;
    }),

  updateLine: protectedProcedure
    .input(budgetLineSchema.extend({ id: z.string(), budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      const { id, budgetYearId: _budgetYearId, ...rest } = input;
      await ctx.db.update(budgetLines).set(rest).where(eq(budgetLines.id, id));
    }),

  deleteLine: protectedProcedure
    .input(z.object({ id: z.string(), budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      await ctx.db.delete(budgetLines).where(eq(budgetLines.id, input.id));
    }),

  /** Order is the whole semantics of the waterfall, so it is set explicitly. */
  reorderLines: protectedProcedure
    .input(z.object({ budgetYearId: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      await Promise.all(
        input.orderedIds.map((id, position) =>
          ctx.db.update(budgetLines).set({ position }).where(eq(budgetLines.id, id)),
        ),
      );
    }),

  addIncomeLine: protectedProcedure
    .input(budgetIncomeLineSchema.extend({ budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      const existing = await ctx.db
        .select({ position: budgetIncomeLines.position })
        .from(budgetIncomeLines)
        .where(eq(budgetIncomeLines.budgetYearId, input.budgetYearId));
      const position = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;
      const [created] = await ctx.db
        .insert(budgetIncomeLines)
        .values({ ...input, position })
        .returning();
      return created;
    }),

  deleteIncomeLine: protectedProcedure
    .input(z.object({ id: z.string(), budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      await ctx.db.delete(budgetIncomeLines).where(eq(budgetIncomeLines.id, input.id));
    }),

  /**
   * What a rule would claim, before saving it.
   *
   * Ignores the ordering deliberately: this answers "does my rule describe the
   * right transactions", which is a different question from "what will this line
   * end up with once the lines above it have taken their share".
   */
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
          .slice(0, 10)
          .map((s) => ({ id: s.id, category: s.category, tags: s.tags, amount: s.myAmount })),
      };
    }),
});
