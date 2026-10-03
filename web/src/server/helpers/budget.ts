import { and, eq, gte, lt, sql } from 'drizzle-orm';

import { splits,
  type budgetIncomeLines,
  type budgetLines,
  type budgetYears,
  statements,
} from '@/db/schema';
import {
  assignToLine,
  matchesRule,
  resolveLoanOwners,
  type MatchableStatement,
} from '@/lib/budget-rules';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { getEMIs } from '@/server/helpers/emi';
import { getEmiPaymentsInRange } from '@/server/helpers/emi-calculations';
import { type PendingIncome } from '@/server/helpers/pending-income';
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
  /**
   * The same figure as spending rather than as a balance movement.
   *
   * An expense is stored as a positive number and money leaving through an
   * outside transaction as a negative one, so the two disagree about which way
   * is out. Income lines want the balance reading -- a salary is a positive
   * outside transaction -- and spending lines want this one, or a line tracking
   * investments reports having spent minus two lakh.
   */
  costAmount: number;
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
    // All of the user's splits, summed per statement and hash-joined in one
    // pass -- four times cheaper than a lookup per statement.
    const owedByStatement = db
      .select({
        statementId: splits.statementId,
        owed: sql<string>`sum(${splits.amount})`.as('owed'),
      })
      .from(splits)
      .where(eq(splits.userId, userId))
      .groupBy(splits.statementId)
      .as('owed_by_statement');
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
        // What friends owe back on this statement, summed in the same query
        // from the user's splits in one pass. Fetched separately this was an IN
        // list of every statement id in the window -- over a thousand parameters
        // to build, send and plan on each budget load.
        owed: sql<string | null>`${owedByStatement.owed}`,
      })
      .from(statements)
      .leftJoin(owedByStatement, eq(owedByStatement.statementId, statements.id))
      .where(
        and(
          eq(statements.userId, userId),
          gte(statements.createdAt, start),
          lt(statements.createdAt, end),
        ),
      );

    return rows.map((row) => {
      const myAmount = Number(row.amount) - Number(row.owed ?? 0);
      return {
        id: row.id,
        createdAt: row.createdAt,
        category: row.category,
        tags: row.tags,
        statementKind: row.statementKind,
        amount: Number(row.amount),
        emiId: row.emiId,
        accountRefs: [row.accountId, row.friendId],
        myAmount,
        costAmount: row.statementKind === 'outside_transaction' ? -myAmount : myAmount,
      };
    });
  },
);

export type LineTotals = {
  lineId: string;
  name: string;
  position: number;
  allocationKind: BudgetLineRow['allocationKind'];
  allocationAmount: number;
  discretionary: boolean;
  /** Nothing more is expected here this year, so what is unspent is really spare. */
  closed: boolean;
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
  /** Pay still to come, by the source the line reads it from. */
  pending: PendingIncome = { salary: 0, bonus: 0, payments: 0 },
): {
  waterfall: number;
  earmarked: Map<string, number>;
  /** Of the pending income, what is destined for the waterfall. */
  pendingWaterfall: number;
  /** Of the pending income, what is destined for a line or the waterfall. */
  pendingCounted: number;
  /** What each pending line is worth, so the table can show it. */
  pendingByLine: Map<string, number>;
} => {
  const ordered = [...incomeLines].sort((a, b) => a.position - b.position);
  const parsed = ordered.map((line) => ({ ...line, rule: parseRule(line.rule) }));
  const earmarked = new Map<string, number>();
  let waterfall = 0;
  let pendingWaterfall = 0;
  let pendingCounted = 0;
  const pendingByLine = new Map<string, number>();

  // Money that has not arrived cannot be matched by a rule, so the lines that
  // read the payroll are settled first, on their own terms. Their destination
  // then works exactly as it does for income that has: down the waterfall, onto
  // one line, or out of the budget entirely.
  const pendingAmountFor = (source: BudgetIncomeLineRow['source']): number | null => {
    if (source === 'pending_salary') {
      return pending.salary;
    }
    return source === 'pending_bonus' ? pending.bonus : null;
  };
  for (const line of parsed) {
    const amount = pendingAmountFor(line.source);
    if (amount === null || amount === 0) {
      continue;
    }
    pendingByLine.set(line.id, amount);
    if (line.destination === 'excluded') {
      continue;
    }
    pendingCounted += amount;
    if (line.destination === 'waterfall') {
      pendingWaterfall += amount;
      continue;
    }
    if (line.destinationLineId !== null) {
      earmarked.set(
        line.destinationLineId,
        (earmarked.get(line.destinationLineId) ?? 0) + amount,
      );
    }
  }

  for (const statement of scoped) {
    // A line that reads the payroll claims no statements, however open its rule
    // looks: an empty rule matches everything, and one of these sitting above
    // the salary line would swallow the salary itself.
    const match = parsed.find(
      (line) => line.source === 'statements' && matchesRule(statement, line.rule),
    );
    if (match === undefined || match.destination === 'excluded') {
      continue;
    }
    if (match.destination === 'waterfall') {
      waterfall += statement.myAmount;
      continue;
    }
    if (match.destinationLineId !== null) {
      earmarked.set(
        match.destinationLineId,
        (earmarked.get(match.destinationLineId) ?? 0) + statement.myAmount,
      );
    }
  }

  return { waterfall, earmarked, pendingWaterfall, pendingCounted, pendingByLine };
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
    closed: line.closed,
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
    totals[index].actual += statement.costAmount;
    totals[index].matchedCount += 1;
  }

  return { totals, unclaimed };
};

export type CycleRow = {
  cycle: string;
  perLine: Record<string, number>;
  total: number;
};

/**
 * Which cycle a date falls in.
 *
 * A cycle opens on the day of the month the budget year started, so the days
 * before that belong to the cycle that opened last month. Every reader of a
 * cycle -- the table, the headline, the phone widget -- asks this, so they
 * cannot disagree about where a month begins.
 */
export const cycleKeyFor = (date: Date, cycleStartDay: number): string => {
  const shifted = new Date(date);
  if (shifted.getDate() < cycleStartDay) {
    shifted.setMonth(shifted.getMonth() - 1);
  }
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
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
    const key = cycleKeyFor(statement.createdAt, cycleStartDay);
    const row = byCycle.get(key) ?? {};
    row[parsed[index].name] = (row[parsed[index].name] ?? 0) + statement.costAmount;
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
 * What a cycle has spent against its monthly allowance.
 *
 * The one definition of "discretionary spend" there is: the headline, the
 * widget and anything else comparing a cycle against its allowance all count
 * the same lines, so changing what counts changes it everywhere at once.
 *
 * Being discretionary is not enough to be counted here -- the line has to be
 * one the allowance was solved for, and `safeToSpendPerMonth` solves only for
 * the monthly ones. A flight is discretionary too, but it is paid for out of a
 * yearly figure, and taking a `60,000` booking off a `9,800` month said the
 * month was overspent when nothing had been spent in it at all.
 */
export const spentOnDiscretionary = (
  cycle: CycleRow | undefined,
  lines: BudgetLineRow[],
): number => {
  const counted = new Set(
    lines
      .filter((line) => line.discretionary && line.allocationKind === 'monthly')
      .map((line) => line.name),
  );
  return Object.entries(cycle?.perLine ?? {}).reduce(
    (sum, [name, amount]) => (counted.has(name) ? sum + amount : sum),
    0,
  );
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
 *
 * A loan taken out before its first instalment falls due has no such row, and
 * went missing from the budget entirely until its first payment was recorded --
 * a flight booked in September stayed invisible until October. Those are placed
 * by the tags on the loan itself.
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

    // Ownership is worked out over there, where it can be tested without a
    // database in front of it.
    const ownerByEmi = resolveLoanOwners(
      lines.map((line) => ({
        id: line.id,
        rule: parseRule(line.rule),
        readsSchedule: line.allocationKind === 'schedule',
      })),
      emis,
      scoped,
    );

    for (const line of lines) {
      const payments = emis
        .filter((emi) => ownerByEmi.get(emi.id) === line.id)
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

/** A budget line as the dashboard's chart selector needs it. */
export type ExpenseLineOption = { id: string; name: string };

/**
 * The lines that can claim an expense, in the order they claim them.
 *
 * A line whose rule admits no expenses -- money home is a friend transaction,
 * investments are outside transactions -- would only ever draw an empty chart,
 * so it is not offered.
 */
export const expenseLineOptions = (lines: BudgetLineRow[]): ExpenseLineOption[] =>
  [...lines]
    .sort((a, b) => a.position - b.position)
    .filter((line) => {
      if (line.allocationKind === 'residual') {
        return false;
      }
      const { statementKinds } = parseRule(line.rule);
      return statementKinds.length === 0 || statementKinds.includes('expense');
    })
    .map((line) => ({ id: line.id, name: line.name }));

/**
 * The statements one line claims, by id.
 *
 * Every line is offered the statements first, because that is the only way to
 * honour first match wins: read on its own a catch-all line's rule matches the
 * rent and the flights too, and a chart scoped to it would double what the
 * budget says it spent.
 */
export const statementIdsForLine = (
  lines: BudgetLineRow[],
  scoped: ScopedStatement[],
  lineId: string,
): string[] => {
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const parsed = ordered.map((line) => ({ ...line, rule: parseRule(line.rule) }));
  const claimed: string[] = [];
  for (const statement of scoped) {
    const index = assignToLine(statement, parsed);
    if (index !== -1 && parsed[index].id === lineId) {
      claimed.push(statement.id);
    }
  }
  return claimed;
};
