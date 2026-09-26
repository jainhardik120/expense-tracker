import type { BudgetRule } from '@/types/budget';

/** The parts of a statement a rule can look at. */
export type MatchableStatement = {
  category: string | null;
  tags: string[];
  statementKind: string;
  /** Account, friend, and transfer counterparty ids -- any one of them can match. */
  accountRefs: (string | null)[];
};

const matchesSet = (allowed: string[], values: (string | null)[]): boolean =>
  allowed.length === 0 || values.some((value) => value !== null && allowed.includes(value));

/**
 * Whether a line claims a statement.
 *
 * Fields are ANDed and values within a field are ORed, so an empty field is "no
 * constraint" rather than "matches nothing" -- a rule with everything empty
 * matches every statement, which is what makes a catch-all line work.
 */
export const matchesRule = (statement: MatchableStatement, rule: BudgetRule): boolean =>
  matchesSet(rule.categories, [statement.category]) &&
  matchesSet(rule.tags, statement.tags) &&
  matchesSet(rule.accounts, statement.accountRefs) &&
  matchesSet(rule.statementKinds, [statement.statementKind]);

/**
 * The first line that claims each statement, in order.
 *
 * First match wins so a statement is never counted twice: put Gifts above
 * Shopping and a gifted washing machine stops eating the shopping budget. The
 * index is returned rather than the line so callers can key totals however they
 * like; -1 means nothing claimed it.
 */
export const assignToLine = <T extends { rule: BudgetRule }>(
  statement: MatchableStatement,
  lines: T[],
): number => lines.findIndex((line) => matchesRule(statement, line.rule));
