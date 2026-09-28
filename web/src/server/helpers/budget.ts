import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import {
  type budgetIncomeLines,
  type budgetLines,
  type budgetYears,
  splits,
  statements,
} from '@/db/schema';
import {
  assignToLine,
  matchesByTags,
  matchesRule,
  type MatchableStatement,
} from '@/lib/budget-rules';
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

    return rows.map((row) => {
      const myAmount = Number(row.amount) - (owedByFriends.get(row.id) ?? 0);
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

    // Which line owns each loan, at most one apiece. Spend is assigned first
    // match wins, and a schedule matched line by line instead would hand the
    // same loan to every rule that fits: a washing machine tagged as a gift is
    // claimed by Gifts, but it is also Shopping, and it is also whatever
    // catch-all sits at the bottom, so its remaining instalments would be
    // counted three times over.
    const ownerByEmi = new Map<string, string>();
    for (const line of lines) {
      const rule = parseRule(line.rule);
      for (const statement of scoped) {
        if (
          statement.emiId !== null &&
          !ownerByEmi.has(statement.emiId) &&
          matchesRule(statement, rule)
        ) {
          ownerByEmi.set(statement.emiId, line.id);
        }
      }
    }

    // A loan signed today has no instalment recorded yet, so no statement can
    // speak for it; its own tags do instead. Only an explicit tag overlap
    // counts -- reading the rest of the rule would give every untagged loan to
    // the first line that constrains nothing.
    for (const emi of emis) {
      if (ownerByEmi.has(emi.id)) {
        continue;
      }
      const owner = lines.find((line) => matchesByTags(emi.tags, parseRule(line.rule)));
      if (owner !== undefined) {
        ownerByEmi.set(emi.id, owner.id);
      }
    }

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
