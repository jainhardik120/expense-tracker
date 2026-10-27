import { toZonedTime } from 'date-fns-tz';
import { and, asc, eq, max } from 'drizzle-orm';
import { z } from 'zod';

import { budgetIncomeLines, budgetLines, budgetYears } from '@/db/schema';
import { cycleAllowance, monthsBetween, project } from '@/lib/budget-projection';
import {
  budgetWindow,
  cycleStartDayOf,
  nextCycleStart,
  spansOverlap,
  toCalendarDate,
  zonedCycleStart,
  zonedDaysBetween,
} from '@/lib/budget-year';
import { getTimezone } from '@/lib/date';
import { type Database } from '@/lib/db';
import {
  expenseLineOptions,
  getScheduledTotals,
  getStatementsInWindow,
  getCurrentYear,
  getYearIncomeLines,
  getYearLines,
  cycleKeyFor,
  spentOnDiscretionary,
  summariseByCycle,
  summariseIncome,
  summariseLines,
} from '@/server/helpers/budget';
import { getLineOptions } from '@/server/helpers/budget-line-filter';
import { getPendingIncome } from '@/server/helpers/pending-income';
import { getPendingSmsEstimate } from '@/server/helpers/sms-estimate';
import { getNetBalance } from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  budgetIncomeLineSchema,
  budgetLineEditSchema,
  budgetLineFormSchema,
  budgetYearSchema,
} from '@/types/budget';

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

type YearLineTable = typeof budgetLines | typeof budgetIncomeLines;

const nextLinePosition = async (tx: Database, table: YearLineTable, budgetYearId: string) => {
  const [{ last }] = await tx
    .select({ last: max(table.position) })
    .from(table)
    .where(eq(table.budgetYearId, budgetYearId));
  return (last ?? -1) + 1;
};

const reorderYearLines = (
  db: Database,
  table: YearLineTable,
  budgetYearId: string,
  orderedIds: string[],
) =>
  db.transaction(async (tx) => {
    for (const [position, id] of orderedIds.entries()) {
      await tx
        .update(table)
        .set({ position })
        .where(and(eq(table.id, id), eq(table.budgetYearId, budgetYearId)));
    }
  });

const deleteYearLine = (db: Database, table: YearLineTable, budgetYearId: string, id: string) =>
  db.delete(table).where(and(eq(table.id, id), eq(table.budgetYearId, budgetYearId)));

const calendarSpan = async (input: { startDate: Date; endDate: Date }) => {
  const timeZone = await getTimezone();
  const span = {
    startDate: toCalendarDate(input.startDate, timeZone),
    endDate: toCalendarDate(input.endDate, timeZone),
  };
  if (span.endDate < span.startDate) {
    throw new Error('The last day must be on or after the first day');
  }
  return span;
};

const assertNoOverlap = async (
  db: Database,
  userId: string,
  span: { startDate: Date; endDate: Date },
  exceptId?: string,
) => {
  const years = await db.select().from(budgetYears).where(eq(budgetYears.userId, userId));
  const clash = years.find((year) => year.id !== exceptId && spansOverlap(year, span));
  if (clash !== undefined) {
    throw new Error(`These dates overlap the budget year "${clash.name}"`);
  }
};

export const budgetRouter = createTRPCRouter({
  getExpenseLines: protectedProcedure.query(async ({ ctx }) => {
    const year = await getCurrentYear(ctx.db, ctx.user.id, await getTimezone());
    if (year === null) {
      return [];
    }
    return expenseLineOptions(await getYearLines(ctx.db, year.id));
  }),

  getLineOptions: protectedProcedure.query(({ ctx }) => getLineOptions(ctx.db, ctx.user.id)),

  getYears: protectedProcedure.query(async ({ ctx }) =>
    ctx.db
      .select()
      .from(budgetYears)
      .where(eq(budgetYears.userId, ctx.user.id))
      .orderBy(asc(budgetYears.startDate)),
  ),

  getCurrentYearId: protectedProcedure.query(
    async ({ ctx }) => (await getCurrentYear(ctx.db, ctx.user.id, await getTimezone()))?.id ?? null,
  ),

  createYear: protectedProcedure.input(budgetYearSchema).mutation(async ({ ctx, input }) => {
    const span = await calendarSpan(input);
    await assertNoOverlap(ctx.db, ctx.user.id, span);
    const [created] = await ctx.db
      .insert(budgetYears)
      .values({ ...input, ...span, userId: ctx.user.id })
      .returning();
    return created;
  }),

  updateYear: protectedProcedure
    .input(budgetYearSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.id);
      const { id, ...rest } = input;
      const span = await calendarSpan(rest);
      await assertNoOverlap(ctx.db, ctx.user.id, span, id);
      await ctx.db
        .update(budgetYears)
        .set({ ...rest, ...span })
        .where(eq(budgetYears.id, id));
    }),

  getYearDetail: protectedProcedure
    .input(z.object({ budgetYearId: z.string() }))
    .query(async ({ ctx, input }) => {
      const year = await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      const timeZone = await getTimezone();
      const window = budgetWindow(year, timeZone);
      const zoned = (date: Date) => toZonedTime(date, timeZone);
      const [lines, incomeLines] = await Promise.all([
        getYearLines(ctx.db, year.id),
        getYearIncomeLines(ctx.db, year.id),
      ]);
      const scoped = await getStatementsInWindow(ctx.db, ctx.user.id, window.start, window.end);
      const { totals, unclaimed, actualsByLine } = summariseLines(lines, scoped);
      const now = new Date();
      const started = window.start <= now;
      const from = started ? now : window.start;
      const until = window.end > from ? window.end : from;
      const pending = await getPendingIncome(ctx.db, ctx.user.id, from, until);
      const income = summariseIncome(
        incomeLines,
        scoped,
        new Set(unclaimed.map((statement) => statement.id)),
        pending,
      );
      const uncounted = [
        ...unclaimed.filter((statement) => statement.statementKind === 'expense'),
        ...income.unmatched,
      ];
      const totalMonths = monthsBetween(zoned(window.start), zoned(window.end));

      const [today, opening] = await Promise.all([
        getNetBalance(ctx.db, ctx.user.id),
        getNetBalance(ctx.db, ctx.user.id, window.start),
      ]);
      const { inAccounts, owedToFriends, net: balanceToday } = today;
      const openingBalance = opening.net;

      const cyclesTotal = Math.round(totalMonths);
      const incomeCyclesRemaining = pending.payments;
      const cyclesElapsed = Math.max(cyclesTotal - incomeCyclesRemaining, 0);
      const monthsRemaining = Math.max(monthsBetween(zoned(from), zoned(until)), 0);

      const earmarkedIncome = new Map(income.earmarked);
      const openingLineId =
        year.openingBalanceDestination === 'line' &&
        lines.some((line) => line.id === year.openingBalanceLineId)
          ? year.openingBalanceLineId
          : null;
      if (openingLineId !== null) {
        earmarkedIncome.set(
          openingLineId,
          (earmarkedIncome.get(openingLineId) ?? 0) + openingBalance,
        );
      }
      const openingInWaterfall =
        year.openingBalanceDestination === 'waterfall' ||
        (year.openingBalanceDestination === 'line' && openingLineId === null);
      const keptOutside =
        (year.openingBalanceDestination === 'excluded' ? openingBalance : 0) +
        incomeLines
          .filter((line) => line.destination === 'excluded' && line.source === 'statements')
          .reduce((sum, line) => sum + (income.claimedByLine.get(line.id) ?? 0), 0);

      const pendingSms = started
        ? await getPendingSmsEstimate(ctx.db, ctx.user.id)
        : { totalSpend: 0, count: 0 };

      const scheduled = await getScheduledTotals(
        ctx.db,
        ctx.user.id,
        lines,
        scoped,
        window.start,
        window.end,
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
          scheduled: scheduled.get(line.lineId) ?? { year: 0, toDate: 0, remaining: 0, overdue: 0 },
          pacePerMonth: cyclesElapsed > 0 ? line.actual / cyclesElapsed : 0,
        })),
        income.waterfall,
        cyclesElapsed,
        cyclesTotal,
        openingInWaterfall ? openingBalance : 0,
        monthsRemaining,
        pendingSms.totalSpend,
        income.pendingWaterfall,
      );
      const cycleStartDay = cycleStartDayOf(year);
      const cycles = summariseByCycle(lines, scoped, cycleStartDay, timeZone);
      const openCycle = cycleKeyFor(from, cycleStartDay, timeZone);
      const spentThisCycle = spentOnDiscretionary(
        cycles.find((row) => row.cycle === openCycle),
        lines,
      );
      const cycleStart = zonedCycleStart(openCycle, cycleStartDay, timeZone);
      const nextCycle = nextCycleStart(cycleStart, timeZone);
      const cycleEnd = nextCycle < window.end ? nextCycle : window.end;
      const daysLeft = Math.max(zonedDaysBetween(from, cycleEnd, timeZone), 0);
      const allowanceInputs = {
        spent: spentThisCycle + pendingSms.totalSpend,
        monthsFromCycleStart: monthsBetween(zoned(cycleStart), zoned(window.end)),
        cycleMonths: monthsBetween(zoned(cycleStart), zoned(cycleEnd)),
        daysLeftInCycle: daysLeft,
        daysInCycle: zonedDaysBetween(cycleStart, cycleEnd, timeZone),
      };
      const thisCycle = {
        key: openCycle,
        endsOn: cycleEnd,
        daysLeft,
        recorded: spentThisCycle,
        allowanceInputs,
        ...cycleAllowance({ affordable: projection.affordable, ...allowanceInputs }),
      };

      return {
        year,
        window,
        started,
        daysLeftInYear: Math.max(zonedDaysBetween(from, window.end, timeZone), 0),
        lines,
        incomeLines,
        totals,
        projection,
        actualsByLine,
        commitmentsByLine: Object.fromEntries(
          [...scheduled].map(([lineId, schedule]) => [lineId, schedule.pendingPayments]),
        ),
        balanceToday,
        balanceParts: { inAccounts, owedToFriends },
        pendingSpend: pendingSms.totalSpend,
        pendingCount: pendingSms.count,
        openingBalance,
        keptOutside,
        incomeCyclesRemaining,
        pendingIncome: pending,
        pendingCounted: income.pendingCounted,
        incomeByLine: Object.fromEntries(
          incomeLines.map((line) => [
            line.id,
            income.pendingByLine.get(line.id) ?? income.claimedByLine.get(line.id) ?? 0,
          ]),
        ),
        cycles,
        thisCycle,
        uncounted: uncounted
          .toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map((statement) => ({
            id: statement.id,
            createdAt: statement.createdAt,
            category: statement.category,
            tags: statement.tags,
            statementKind: statement.statementKind,
            balanceEffect: -statement.costAmount,
          })),
      };
    }),

  setGoal: protectedProcedure
    .input(z.object({ budgetYearId: z.string(), amount: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      const updated = await ctx.db
        .update(budgetLines)
        .set({ allocationAmount: String(input.amount) })
        .where(
          and(
            eq(budgetLines.budgetYearId, input.budgetYearId),
            eq(budgetLines.allocationKind, 'residual'),
          ),
        )
        .returning({ id: budgetLines.id });
      if (updated.length === 0) {
        throw new Error('This year has no investment line to set a goal on');
      }
    }),

  copyLinesFromYear: protectedProcedure
    .input(z.object({ budgetYearId: z.string(), sourceYearId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        if (input.budgetYearId === input.sourceYearId) {
          throw new Error('Pick a different year to copy from');
        }
        await lockOwnedYear(tx, ctx.user.id, input.budgetYearId);
        await assertOwnedYear(tx, ctx.user.id, input.sourceYearId);
        const [sourceLines, sourceIncome, targetLines, targetIncome] = await Promise.all([
          getYearLines(tx, input.sourceYearId),
          getYearIncomeLines(tx, input.sourceYearId),
          getYearLines(tx, input.budgetYearId),
          getYearIncomeLines(tx, input.budgetYearId),
        ]);
        const lineIdBySource = new Map<string, string>();
        const targetLineByName = new Map(targetLines.map((line) => [line.name, line.id]));
        let linePosition = await nextLinePosition(tx, budgetLines, input.budgetYearId);
        let addedLines = 0;
        for (const line of sourceLines) {
          const existing = targetLineByName.get(line.name);
          if (existing !== undefined) {
            lineIdBySource.set(line.id, existing);
            continue;
          }
          const [created] = await tx
            .insert(budgetLines)
            .values({
              budgetYearId: input.budgetYearId,
              name: line.name,
              position: linePosition,
              rule: line.rule,
              allocationKind: line.allocationKind,
              allocationAmount: line.allocationAmount,
              discretionary: line.discretionary,
              closed: false,
            })
            .returning({ id: budgetLines.id });
          lineIdBySource.set(line.id, created.id);
          linePosition += 1;
          addedLines += 1;
        }
        const targetIncomeNames = new Set(targetIncome.map((line) => line.name));
        let incomePosition = await nextLinePosition(tx, budgetIncomeLines, input.budgetYearId);
        let addedIncome = 0;
        for (const line of sourceIncome) {
          if (targetIncomeNames.has(line.name)) {
            continue;
          }
          await tx.insert(budgetIncomeLines).values({
            budgetYearId: input.budgetYearId,
            name: line.name,
            position: incomePosition,
            rule: line.rule,
            source: line.source,
            destination: line.destination,
            destinationLineId:
              line.destinationLineId === null
                ? null
                : (lineIdBySource.get(line.destinationLineId) ?? null),
          });
          incomePosition += 1;
          addedIncome += 1;
        }
        return { addedLines, addedIncome };
      }),
    ),

  createLine: protectedProcedure.input(budgetLineFormSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      await lockOwnedYear(tx, ctx.user.id, input.budgetYearId);
      const [created] = await tx
        .insert(budgetLines)
        .values({
          ...input,
          position: await nextLinePosition(tx, budgetLines, input.budgetYearId),
        })
        .returning();
      return created;
    }),
  ),

  updateLine: protectedProcedure.input(budgetLineEditSchema).mutation(async ({ ctx, input }) => {
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
      await deleteYearLine(ctx.db, budgetLines, input.budgetYearId, input.id);
    }),

  reorderLines: protectedProcedure
    .input(z.object({ budgetYearId: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      await reorderYearLines(ctx.db, budgetLines, input.budgetYearId, input.orderedIds);
    }),

  createIncomeLine: protectedProcedure
    .input(budgetIncomeLineSchema.extend({ budgetYearId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockOwnedYear(tx, ctx.user.id, input.budgetYearId);
        const [created] = await tx
          .insert(budgetIncomeLines)
          .values({
            ...input,
            position: await nextLinePosition(tx, budgetIncomeLines, input.budgetYearId),
          })
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
      await reorderYearLines(ctx.db, budgetIncomeLines, input.budgetYearId, input.orderedIds);
    }),

  deleteIncomeLine: protectedProcedure
    .input(z.object({ id: z.string(), budgetYearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedYear(ctx.db, ctx.user.id, input.budgetYearId);
      await deleteYearLine(ctx.db, budgetIncomeLines, input.budgetYearId, input.id);
    }),
});
