import { asc, eq, sql } from 'drizzle-orm';

import { budgetIncomeLines, budgetLines } from '@/db/schema';
import {
  assignToLine,
  matchesRule,
  resolveLoanOwners,
  type MatchableStatement,
} from '@/lib/budget-rules';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { getEmis } from '@/server/helpers/emi';
import { getEmiPaymentsInRange } from '@/server/helpers/emi-calculations';
import { type PendingIncome } from '@/server/helpers/pending-income';
import { budgetRuleSchema, emptyBudgetRule, type BudgetRule } from '@/types/budget';

type WithParsedRule<T> = Omit<T, 'rule'> & { rule: BudgetRule };

export type BudgetLineRow = WithParsedRule<typeof budgetLines.$inferSelect>;
export type BudgetIncomeLineRow = WithParsedRule<typeof budgetIncomeLines.$inferSelect>;
const parseRule = (value: unknown): BudgetRule => {
  const result = budgetRuleSchema.safeParse(value);
  return result.success ? result.data : emptyBudgetRule;
};

type ScopedStatement = MatchableStatement & {
  id: string;
  emiId: string | null;
  createdAt: Date;
  myAmount: number;
  costAmount: number;
};

const toTimestamp = (date: Date): string => date.toISOString().replace('T', ' ').replace('Z', '');

export const getYearLines = instrumentedFunction(
  'getYearLines',
  async (db: Database, budgetYearId: string): Promise<BudgetLineRow[]> =>
    (
      await db
        .select()
        .from(budgetLines)
        .where(eq(budgetLines.budgetYearId, budgetYearId))
        .orderBy(asc(budgetLines.position))
    ).map((line) => ({ ...line, rule: parseRule(line.rule) })),
);

export const getYearIncomeLines = instrumentedFunction(
  'getYearIncomeLines',
  async (db: Database, budgetYearId: string): Promise<BudgetIncomeLineRow[]> =>
    (
      await db
        .select()
        .from(budgetIncomeLines)
        .where(eq(budgetIncomeLines.budgetYearId, budgetYearId))
        .orderBy(asc(budgetIncomeLines.position))
    ).map((line) => ({ ...line, rule: parseRule(line.rule) })),
);

export const getStatementsInWindow = instrumentedFunction(
  'getStatementsInWindow',
  async (db: Database, userId: string, start: Date, end: Date): Promise<ScopedStatement[]> => {
    const { rows } = await db.execute<{
      id: string;
      created_ms: string;
      category: string | null;
      tags: string[];
      kind: ScopedStatement['statementKind'];
      account_id: string | null;
      friend_id: string | null;
      amount: string;
      emi_id: string | null;
      owed: string | null;
    }>(sql`
      select s.id, (extract(epoch from s.created_at) * 1000)::bigint as created_ms, s.category,
             s.tags, s."statementKind" as kind, s.account_id, s.friend_id, s.amount,
             s.additional_attributes->>'emiId' as emi_id, o.owed
      from statements s
      left join (
        select statement_id, sum(amount) as owed from splits
        where user_id = ${userId} group by statement_id
      ) o on o.statement_id = s.id
      where s.user_id = ${userId}
        and s.created_at >= ${toTimestamp(start)}::timestamp
        and s.created_at < ${toTimestamp(end)}::timestamp`);

    return rows.map((row) => {
      const myAmount = Number(row.amount) - Number(row.owed ?? 0);
      return {
        id: row.id,
        createdAt: new Date(Number(row.created_ms)),
        category: row.category,
        tags: row.tags,
        statementKind: row.kind,
        amount: Number(row.amount),
        emiId: row.emi_id,
        accountRefs: [row.account_id, row.friend_id],
        myAmount,
        costAmount: row.kind === 'outside_transaction' ? -myAmount : myAmount,
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
  closed: boolean;
  actual: number;
  matchedCount: number;
};

export const summariseIncome = (
  incomeLines: BudgetIncomeLineRow[],
  scoped: ScopedStatement[],
  pending: PendingIncome = { salary: 0, bonus: 0, payments: 0 },
): {
  waterfall: number;
  earmarked: Map<string, number>;
  pendingWaterfall: number;
  pendingCounted: number;
  pendingByLine: Map<string, number>;
} => {
  const ordered = [...incomeLines].sort((a, b) => a.position - b.position);
  const earmarked = new Map<string, number>();
  let waterfall = 0;
  let pendingWaterfall = 0;
  let pendingCounted = 0;
  const pendingByLine = new Map<string, number>();

  const pendingAmountFor = (source: BudgetIncomeLineRow['source']): number | null => {
    if (source === 'pending_salary') {
      return pending.salary;
    }
    return source === 'pending_bonus' ? pending.bonus : null;
  };
  for (const line of ordered) {
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
      earmarked.set(line.destinationLineId, (earmarked.get(line.destinationLineId) ?? 0) + amount);
    }
  }

  for (const statement of scoped) {
    const match = ordered.find(
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
  const totals: LineTotals[] = ordered.map((line) => ({
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
    const index = assignToLine(statement, ordered);
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

export const cycleKeyFor = (date: Date, cycleStartDay: number): string => {
  const shifted = new Date(date);
  if (shifted.getDate() < cycleStartDay) {
    shifted.setMonth(shifted.getMonth() - 1);
  }
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

export const summariseByCycle = (
  lines: BudgetLineRow[],
  scoped: ScopedStatement[],
  cycleStartDay: number,
): CycleRow[] => {
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const byCycle = new Map<string, Record<string, number>>();

  for (const statement of scoped) {
    const index = assignToLine(statement, ordered);
    if (index === -1) {
      continue;
    }
    const key = cycleKeyFor(statement.createdAt, cycleStartDay);
    const row = byCycle.get(key) ?? {};
    row[ordered[index].name] = (row[ordered[index].name] ?? 0) + statement.costAmount;
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

export type ScheduleTotals = { year: number; toDate: number; remaining: number };

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

    const emis = await getEmis(db, userId, {
      completed: undefined,
      perPage: 100,
      page: 1,
      accountId: [],
      creditId: [],
    });

    const ownerByEmi = resolveLoanOwners(
      lines.map((line) => ({
        id: line.id,
        rule: line.rule,
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

export type ExpenseLineOption = { id: string; name: string };

export const expenseLineOptions = (lines: BudgetLineRow[]): ExpenseLineOption[] =>
  [...lines]
    .sort((a, b) => a.position - b.position)
    .filter((line) => {
      if (line.allocationKind === 'residual') {
        return false;
      }
      const { statementKinds } = line.rule;
      return statementKinds.length === 0 || statementKinds.includes('expense');
    })
    .map((line) => ({ id: line.id, name: line.name }));

export const statementIdsForLine = (
  lines: BudgetLineRow[],
  scoped: ScopedStatement[],
  lineId: string,
): string[] => {
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const claimed: string[] = [];
  for (const statement of scoped) {
    const index = assignToLine(statement, ordered);
    if (index !== -1 && ordered[index].id === lineId) {
      claimed.push(statement.id);
    }
  }
  return claimed;
};
