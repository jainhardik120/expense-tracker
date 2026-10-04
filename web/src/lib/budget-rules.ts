import type { BudgetRule } from '@/types/budget';

export type MatchableStatement = {
  category: string | null;
  tags: string[];
  statementKind: string;
  amount: number;
  accountRefs: (string | null)[];
};

const matchesSet = (allowed: string[], values: (string | null)[]): boolean =>
  allowed.length === 0 || values.some((value) => value !== null && allowed.includes(value));

export const matchesRule = (statement: MatchableStatement, rule: BudgetRule): boolean =>
  matchesSet(rule.categories, [statement.category]) &&
  matchesSet(rule.tags, statement.tags) &&
  matchesSet(rule.accounts, statement.accountRefs) &&
  matchesSet(rule.statementKinds, [statement.statementKind]) &&
  (rule.maxAmount === null || statement.amount <= rule.maxAmount) &&
  (rule.minAmount === null || statement.amount >= rule.minAmount);

export const matchesByTags = (tags: string[], rule: BudgetRule): boolean =>
  rule.tags.length > 0 && tags.some((tag) => rule.tags.includes(tag));

export const assignToLine = <T extends { rule: BudgetRule }>(
  statement: MatchableStatement,
  lines: T[],
): number => lines.findIndex((line) => matchesRule(statement, line.rule));

export type ClaimableLoan = { id: string; tags: string[] };

export type ClaimingLine = {
  id: string;
  rule: BudgetRule;
  readsSchedule: boolean;
};

export const resolveLoanOwners = (
  lines: ClaimingLine[],
  loans: ClaimableLoan[],
  instalments: (MatchableStatement & { emiId: string | null })[],
): Map<string, string> => {
  const owners = new Map<string, string>();

  for (const line of lines.filter((candidate) => candidate.readsSchedule)) {
    for (const loan of loans) {
      if (!owners.has(loan.id) && matchesByTags(loan.tags, line.rule)) {
        owners.set(loan.id, line.id);
      }
    }
  }

  for (const line of lines.filter((candidate) => !candidate.readsSchedule)) {
    for (const instalment of instalments) {
      const { emiId } = instalment;
      if (emiId !== null && !owners.has(emiId) && matchesRule(instalment, line.rule)) {
        owners.set(emiId, line.id);
      }
    }
  }

  for (const loan of loans) {
    if (owners.has(loan.id)) {
      continue;
    }
    const owner = lines.find((line) => matchesByTags(loan.tags, line.rule));
    if (owner !== undefined) {
      owners.set(loan.id, owner.id);
    }
  }

  return owners;
};
