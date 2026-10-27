import { and, asc, desc, eq, inArray, or, type SQL, sql, type SQLWrapper } from 'drizzle-orm';

import { budgetIncomeLines, budgetLines, budgetYears } from '@/db/schema';
import { budgetWindow } from '@/lib/budget-year';
import { getTimezone } from '@/lib/date';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { getCurrentYear } from '@/server/helpers/budget';
import { budgetRuleSchema, emptyBudgetRule, type BudgetRule } from '@/types/budget';

type Column = SQLWrapper | SQL.Aliased;

const toTimestamp = (date: Date): string => date.toISOString().replace('T', ' ').replace('Z', '');

export type RuleColumns = {
  createdAt: Column;
  category: Column;
  tags: Column;
  accountId: Column;
  friendId: Column;
  statementKind: Column;
  amount: Column;
};

type LineTarget = {
  start: Date;
  end: Date;
  rule: BudgetRule;
  claimedEarlier: BudgetRule[];
  side: 'spend' | 'income';
};

export type LineScope = { targets: LineTarget[] } | null;

const parseRule = (value: unknown): BudgetRule => {
  const result = budgetRuleSchema.safeParse(value);
  return result.success ? result.data : emptyBudgetRule;
};

const AND = sql` AND `;
const OR = sql` OR `;

const inList = (column: Column, values: string[]) =>
  sql`(${column} IS NOT NULL AND ${column}::text IN ${values})`;

const ruleMatches = (rule: BudgetRule, columns: RuleColumns): SQL => {
  const parts: SQL[] = [];
  if (rule.categories.length > 0) {
    parts.push(inList(columns.category, rule.categories));
  }
  if (rule.tags.length > 0) {
    parts.push(
      sql`(${columns.tags} && ARRAY[${sql.join(
        rule.tags.map((tag) => sql`${tag}`),
        sql`, `,
      )}]::text[])`,
    );
  }
  if (rule.accounts.length > 0) {
    parts.push(
      sql`(${inList(columns.accountId, rule.accounts)} OR ${inList(columns.friendId, rule.accounts)})`,
    );
  }
  if (rule.statementKinds.length > 0) {
    parts.push(inList(columns.statementKind, rule.statementKinds));
  }
  if (rule.maxAmount !== null) {
    parts.push(sql`(${columns.amount} <= ${rule.maxAmount})`);
  }
  if (rule.minAmount !== null) {
    parts.push(sql`(${columns.amount} >= ${rule.minAmount})`);
  }
  return parts.length === 0 ? sql`true` : sql`(${sql.join(parts, AND)})`;
};

export const lineScopeCondition = (scope: LineScope, columns: RuleColumns): SQL | undefined => {
  if (scope === null) {
    return undefined;
  }
  if (scope.targets.length === 0) {
    return sql`false`;
  }
  const kind = sql`${columns.statementKind}::text`;
  const friendAdjustment = sql`(${kind} = 'friend_transaction' AND ${columns.accountId} IS NULL)`;
  const reachableBy = {
    spend: sql`(${kind} IN ('expense', 'outside_transaction') OR ${friendAdjustment})`,
    income: sql`(${kind} = 'outside_transaction' OR ${friendAdjustment})`,
  };
  const perTarget = scope.targets.map((target) => {
    const earlier =
      target.claimedEarlier.length === 0
        ? sql`false`
        : sql`(${sql.join(
            target.claimedEarlier.map((rule) => ruleMatches(rule, columns)),
            OR,
          )})`;
    return sql`(${columns.createdAt} >= ${toTimestamp(target.start)}::timestamp AND ${columns.createdAt} < ${toTimestamp(target.end)}::timestamp AND ${reachableBy[target.side]} AND ${ruleMatches(target.rule, columns)} AND NOT ${earlier})`;
  });
  return or(...perTarget);
};

export const resolveLineScope = instrumentedFunction(
  'resolveLineScope',
  async (db: Database, userId: string, lineIds: string[]): Promise<LineScope> => {
    if (lineIds.length === 0) {
      return null;
    }
    const years = await db.select().from(budgetYears).where(eq(budgetYears.userId, userId));
    if (years.length === 0) {
      return { targets: [] };
    }
    const yearIds = years.map((year) => year.id);
    const [spendLines, incomeLines] = await Promise.all([
      db
        .select()
        .from(budgetLines)
        .where(inArray(budgetLines.budgetYearId, yearIds))
        .orderBy(asc(budgetLines.position)),
      db
        .select()
        .from(budgetIncomeLines)
        .where(
          and(
            inArray(budgetIncomeLines.budgetYearId, yearIds),
            eq(budgetIncomeLines.source, 'statements'),
          ),
        )
        .orderBy(asc(budgetIncomeLines.position)),
    ]);
    const timeZone = await getTimezone();
    const yearById = new Map(years.map((year) => [year.id, year]));
    const targets: LineTarget[] = [];
    const rulesBefore = (
      family: Array<{ budgetYearId: string; position: number; rule: unknown }>,
      line: { budgetYearId: string; position: number },
    ) =>
      family
        .filter((other) => other.budgetYearId === line.budgetYearId)
        .filter((other) => other.position < line.position)
        .map((other) => parseRule(other.rule));
    for (const line of spendLines) {
      const year = yearById.get(line.budgetYearId);
      if (!lineIds.includes(line.id) || year === undefined) {
        continue;
      }
      targets.push({
        ...budgetWindow(year, timeZone),
        rule: parseRule(line.rule),
        claimedEarlier: rulesBefore(spendLines, line),
        side: 'spend',
      });
    }
    for (const line of incomeLines) {
      const year = yearById.get(line.budgetYearId);
      if (!lineIds.includes(line.id) || year === undefined) {
        continue;
      }
      targets.push({
        ...budgetWindow(year, timeZone),
        rule: parseRule(line.rule),
        claimedEarlier: [
          ...spendLines
            .filter((other) => other.budgetYearId === line.budgetYearId)
            .map((other) => parseRule(other.rule)),
          ...rulesBefore(incomeLines, line),
        ],
        side: 'income',
      });
    }
    return { targets };
  },
);

export type LineOption = {
  id: string;
  name: string;
  kind: 'spend' | 'income';
  yearName: string;
};

export const getLineOptions = instrumentedFunction(
  'getLineOptions',
  async (db: Database, userId: string): Promise<LineOption[]> => {
    const [spendRows, incomeRows] = await Promise.all([
      db
        .select({ id: budgetLines.id, name: budgetLines.name, yearName: budgetYears.name })
        .from(budgetLines)
        .innerJoin(budgetYears, eq(budgetYears.id, budgetLines.budgetYearId))
        .where(eq(budgetYears.userId, userId))
        .orderBy(desc(budgetYears.startDate), asc(budgetLines.position)),
      db
        .select({
          id: budgetIncomeLines.id,
          name: budgetIncomeLines.name,
          yearName: budgetYears.name,
        })
        .from(budgetIncomeLines)
        .innerJoin(budgetYears, eq(budgetYears.id, budgetIncomeLines.budgetYearId))
        .where(and(eq(budgetYears.userId, userId), eq(budgetIncomeLines.source, 'statements')))
        .orderBy(desc(budgetYears.startDate), asc(budgetIncomeLines.position)),
    ]);
    return [
      ...spendRows.map((row) => ({ ...row, kind: 'spend' as const })),
      ...incomeRows.map((row) => ({ ...row, kind: 'income' as const })),
    ];
  },
);

export const resolveChartLineScope = instrumentedFunction(
  'resolveChartLineScope',
  async (
    db: Database,
    userId: string,
    lineId: string,
    start?: Date,
    end?: Date,
  ): Promise<LineScope> => {
    if (start === undefined || end === undefined) {
      return { targets: [] };
    }
    const latest = (await getCurrentYear(db, userId, await getTimezone())) ?? undefined;
    if (latest === undefined) {
      return { targets: [] };
    }
    const lines = await db
      .select({ id: budgetLines.id, position: budgetLines.position, rule: budgetLines.rule })
      .from(budgetLines)
      .where(eq(budgetLines.budgetYearId, latest.id))
      .orderBy(asc(budgetLines.position));
    const line = lines.find((candidate) => candidate.id === lineId);
    if (line === undefined) {
      return { targets: [] };
    }
    return {
      targets: [
        {
          start,
          end,
          rule: parseRule(line.rule),
          claimedEarlier: lines
            .filter((other) => other.position < line.position)
            .map((other) => parseRule(other.rule)),
          side: 'spend',
        },
      ],
    };
  },
);
