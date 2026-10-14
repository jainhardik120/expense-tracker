import { and, asc, desc, eq, inArray, or, type SQL, sql, type SQLWrapper } from 'drizzle-orm';

import { budgetIncomeLines, budgetLines, budgetYears } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
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

type LineTarget = { start: Date; end: Date; rule: BudgetRule; claimedEarlier: BudgetRule[] };

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
  const notSelfTransfer = sql`${columns.statementKind}::text <> 'self_transfer'`;
  const perTarget = scope.targets.map((target) => {
    const earlier =
      target.claimedEarlier.length === 0
        ? sql`false`
        : sql`(${sql.join(
            target.claimedEarlier.map((rule) => ruleMatches(rule, columns)),
            OR,
          )})`;
    return sql`(${columns.createdAt} >= ${toTimestamp(target.start)}::timestamp AND ${columns.createdAt} < ${toTimestamp(target.end)}::timestamp AND ${ruleMatches(target.rule, columns)} AND NOT ${earlier})`;
  });
  return and(notSelfTransfer, or(...perTarget));
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
    const yearById = new Map(years.map((year) => [year.id, year]));
    const targets: LineTarget[] = [];
    for (const family of [spendLines, incomeLines]) {
      for (const line of family) {
        const year = yearById.get(line.budgetYearId);
        if (!lineIds.includes(line.id) || year === undefined) {
          continue;
        }
        targets.push({
          start: year.startDate,
          end: year.endDate,
          rule: parseRule(line.rule),
          claimedEarlier: family
            .filter((other) => other.budgetYearId === line.budgetYearId)
            .filter((other) => other.position < line.position)
            .map((other) => parseRule(other.rule)),
        });
      }
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
