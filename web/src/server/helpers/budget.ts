import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import {
  type budgetIncomeLines,
  type budgetLines,
  type budgetYears,
  splits,
  statements,
} from '@/db/schema';
import { assignToLine, matchesRule, type MatchableStatement } from '@/lib/budget-rules';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { getEMIs } from '@/server/helpers/emi';
import { getEmiPaymentsInRange } from '@/server/helpers/emi-calculations';
import { budgetRuleSchema, emptyBudgetRule, type BudgetRule } from '@/types/budget';

export type BudgetLineRow = typeof budgetLines.$inferSelect;
export type BudgetIncomeLineRow = typeof budgetIncomeLines.$inferSelect;
export type BudgetYearRow = typeof budgetYears.$inferSelect;

/** Rules are stored as jsonb, so they are parsed rather than trusted on the way out. */
export const parseRule = (value: unknown): BudgetRule => {
  const result = budgetRuleSchema.safeParse(value);
  return result.success ? result.data : emptyBudgetRule;
};

type ScopedStatement = MatchableStatement & {
  id: string;
  /** Set when the statement is a loan instalment, which is how a line finds its loans. */
  emiId: string | null;
  createdAt: Date;
  /** What this cost me: the amount less whatever friends owe on it. */
  myAmount: number;
};

/**
 * Every statement in the window, with friends' share already removed.
 *
 * Cash basis: EMI installments are ordinary statements dated when they are paid,
 * so only the ones actually falling inside the window are here -- a 24 month
 * loan contributes the installments it reached, not its whole principal.
 */
export const getStatementsInWindow = instrumentedFunction(
  'getStatementsInWindow',
  async (db: Database, userId: string, start: Date, end: Date): Promise<ScopedStatement[]> => {
    const rows = await db
      .select({
        id: statements.id,
        createdAt: statements.createdAt,
        category: statements.category,
        tags: statements.tags,
        statementKind: statements.statementKind,
        accountId: statements.accountId,
        friendId: statements.friendId,
        amount: statements.amount,
        emiId: sql<string | null>`${statements.additionalAttributes}->>'emiId'`,
      })
      .from(statements)
      .where(
        and(
          eq(statements.userId, userId),
          gte(statements.createdAt, start),
          lt(statements.createdAt, end),
        ),
      );

    // Fetched separately and joined here rather than as a correlated subquery:
    // one extra round trip, and the arithmetic is somewhere it can be read.
    const splitRows =
      rows.length === 0
        ? []
        : await db
            .select({ statementId: splits.statementId, amount: splits.amount })
            .from(splits)
            .where(
              inArray(
                splits.statementId,
                rows.map((row) => row.id),
              ),
            );
    const owedByFriends = new Map<string, number>();
    for (const split of splitRows) {
      owedByFriends.set(
        split.statementId,
        (owedByFriends.get(split.statementId) ?? 0) + Number(split.amount),
      );
    }

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      category: row.category,
      tags: row.tags,
      statementKind: row.statementKind,
      amount: Number(row.amount),
      emiId: row.emiId,
      accountRefs: [row.accountId, row.friendId],
      myAmount: Number(row.amount) - (owedByFriends.get(row.id) ?? 0),
    }));
  },
);

export type LineTotals = {
  lineId: string;
  name: string;
  position: number;
  allocationKind: BudgetLineRow['allocationKind'];
  allocationAmount: number;
  discretionary: boolean;
  /** Spent against this line so far, my share only. */
  actual: number;
  matchedCount: number;
};

/**
 * Walk the lines in order and hand each statement to the first that claims it.
 *
 * Every kind is offered, not just expenses: money sent home is a friend
 * transaction rather than an expense, but it is unquestionably spending and has
 * to be able to land on a line. Rules narrow by kind where that matters, and a
 * catch-all line is expected to say `statementKinds: ['expense']` so it does not
 * swallow the lending and settling flows, which are not budget items at all.
 */
/**
 * Income by destination: what flows down the waterfall, and what is pointed at
 * a specific line. Excluded income is simply not returned -- a bonus kept out of
 * the budget should not appear in it at all.
 */
export const summariseIncome = (
  incomeLines: BudgetIncomeLineRow[],
  scoped: ScopedStatement[],
): { waterfall: number; waterfallCount: number; earmarked: Map<string, number> } => {
  const ordered = [...incomeLines].sort((a, b) => a.position - b.position);
  const parsed = ordered.map((line) => ({ ...line, rule: parseRule(line.rule) }));
  const earmarked = new Map<string, number>();
  let waterfall = 0;
  // Counted, not just summed: the budget runs on pay cycles rather than calendar
  // months, and how many have landed is what says how many are left.
  let waterfallCount = 0;

  for (const statement of scoped) {
    const match = parsed.find((line) => matchesRule(statement, line.rule));
    if (match === undefined || match.destination === 'excluded') {
      continue;
    }
    if (match.destination === 'waterfall') {
      waterfall += statement.myAmount;
      waterfallCount += 1;
      continue;
    }
    if (match.destinationLineId !== null) {
      earmarked.set(
        match.destinationLineId,
        (earmarked.get(match.destinationLineId) ?? 0) + statement.myAmount,
      );
    }
  }

  return { waterfall, waterfallCount, earmarked };
};

export const summariseLines = (
  lines: BudgetLineRow[],
  scoped: ScopedStatement[],
): { totals: LineTotals[]; unclaimed: ScopedStatement[] } => {
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const parsed = ordered.map((line) => ({ ...line, rule: parseRule(line.rule) }));
  const totals: LineTotals[] = parsed.map((line) => ({
    lineId: line.id,
    name: line.name,
    position: line.position,
    allocationKind: line.allocationKind,
    allocationAmount: Number(line.allocationAmount),
    discretionary: line.discretionary,
    actual: 0,
    matchedCount: 0,
  }));
  const unclaimed: ScopedStatement[] = [];

  for (const statement of scoped) {
    const index = assignToLine(statement, parsed);
    if (index === -1) {
      unclaimed.push(statement);
      continue;
    }
    totals[index].actual += statement.myAmount;
    totals[index].matchedCount += 1;
  }

  return { totals, unclaimed };
};

/**
 * Loan installments still to be paid before the year is out.
 *
 * Cash, not commitment: a loan running past the window contributes only the
 * installments that fall inside it. Already-paid installments are statements
 * and are counted by the lines, so only the unpaid ones belong here.
 */
export const getRemainingEmiCash = instrumentedFunction(
  'getRemainingEmiCash',
  async (db: Database, userId: string, from: Date, to: Date): Promise<number> => {
    const emis = await getEMIs(db, userId, {
      completed: undefined,
      perPage: 100,
      page: 1,
      accountId: [],
      creditId: [],
    });
    return emis
      .flatMap((emi) => getEmiPaymentsInRange(emi, emi.creditCardName, from, to, from))
      .filter((payment) => payment.status !== 'paid')
      .reduce((sum, payment) => sum + payment.myShare, 0);
  },
);

export type CycleRow = {
  cycle: string;
  perLine: Record<string, number>;
  total: number;
};

/**
 * Spending per pay cycle rather than per calendar month.
 *
 * A salary arriving on the 24th makes the 24th the start of the month that
 * matters: rent, money home and everything else are paid out of it. Bucketing
 * by calendar month would split a single cycle's spending across two rows.
 */
export const summariseByCycle = (
  lines: BudgetLineRow[],
  scoped: ScopedStatement[],
  cycleStartDay: number,
): CycleRow[] => {
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const parsed = ordered.map((line) => ({ ...line, rule: parseRule(line.rule) }));
  const byCycle = new Map<string, Record<string, number>>();

  for (const statement of scoped) {
    const index = assignToLine(statement, parsed);
    if (index === -1) {
      continue;
    }
    const date = statement.createdAt;
    // Anything before the cycle day belongs to the cycle that opened last month.
    const shifted = new Date(date);
    if (shifted.getDate() < cycleStartDay) {
      shifted.setMonth(shifted.getMonth() - 1);
    }
    const key = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
    const row = byCycle.get(key) ?? {};
    row[parsed[index].name] = (row[parsed[index].name] ?? 0) + statement.myAmount;
    byCycle.set(key, row);
  }

  return [...byCycle.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cycle, perLine]) => ({
      cycle,
      perLine,
      total: Object.values(perLine).reduce((sum, value) => sum + value, 0),
    }));
};

/**
 * What the loan schedule says a line will cost inside the window.
 *
 * An instalment plan rarely lines up with a budget year -- a holiday taken in
 * March runs nine of its twenty-four months before December, a gym subscription
 * is annual but paid off in nine -- so there is no honest monthly figure to type
 * in. The schedule already knows; it is asked rather than guessed at.
 *
 * Which loans a line covers is decided the same way everything else is: by the
 * statements its rule claims. An instalment already paid is a statement carrying
 * its loan's id, so the loans a line owns are the ones behind its own rows.
 */
export type ScheduleTotals = { year: number; toDate: number; remaining: number };

/**
 * What the loan and recurring schedules say a line will cost inside the window.
 *
 * Computed for every line, not just the schedule-derived ones: a gift bought on
 * instalments is still going to take two more payments before December, and a
 * reconciliation that stops at today would miss them.
 *
 * Which commitments a line covers is decided the way everything else is -- by
 * the statements its rule claims. A paid instalment carries its loan's id, and a
 * settled recurring payment carries its own, so the commitments behind a line
 * are the ones behind its own rows.
 */
export const getScheduledTotals = instrumentedFunction(
  'getScheduledTotals',
  async (
    db: Database,
    userId: string,
    lines: BudgetLineRow[],
    scoped: ScopedStatement[],
    from: Date,
    to: Date,
    now: Date,
  ): Promise<Map<string, ScheduleTotals>> => {
    const totals = new Map<string, ScheduleTotals>();
    if (lines.length === 0) {
      return totals;
    }

    const emis = await getEMIs(db, userId, {
      completed: undefined,
      perPage: 100,
      page: 1,
      accountId: [],
      creditId: [],
    });

    for (const line of lines) {
      const rule = parseRule(line.rule);
      const claimed = scoped.filter((statement) => matchesRule(statement, rule));
      const emiIds = new Set(claimed.filter((s) => s.emiId !== null).map((s) => s.emiId as string));
      const payments = emis
        .filter((emi) => emiIds.has(emi.id))
        .flatMap((emi) => getEmiPaymentsInRange(emi, emi.creditCardName, from, to, now));
      totals.set(line.id, {
        year: payments.reduce((sum, payment) => sum + payment.myShare, 0),
        toDate: payments
          .filter((payment) => payment.date <= now)
          .reduce((sum, payment) => sum + payment.myShare, 0),
        remaining: payments
          .filter((payment) => payment.date > now)
          .reduce((sum, payment) => sum + payment.myShare, 0),
      });
    }
    return totals;
  },
);
