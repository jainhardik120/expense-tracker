import type { BudgetRule } from '@/types/budget';

/** The parts of a statement a rule can look at. */
export type MatchableStatement = {
  category: string | null;
  tags: string[];
  statementKind: string;
  /** The full amount, before splits -- bounds describe the transaction itself. */
  amount: number;
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
  matchesSet(rule.statementKinds, [statement.statementKind]) &&
  (rule.maxAmount === null || statement.amount <= rule.maxAmount) &&
  (rule.minAmount === null || statement.amount >= rule.minAmount);

/**
 * Whether a line claims a commitment by the commitment's own tags.
 *
 * A loan carries no category, counterparty or kind of its own -- only a name, a
 * schedule, and whatever tags it was given -- so the rest of a rule has nothing
 * to read. Tags alone decide, and only when the rule names some: treating an
 * empty tag list as "no constraint" the way matchesRule does would hand every
 * untagged loan to the first line that constrains nothing, which is usually the
 * catch-all at the bottom.
 */
export const matchesByTags = (tags: string[], rule: BudgetRule): boolean =>
  rule.tags.length > 0 && tags.some((tag) => rule.tags.includes(tag));

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

/** A loan, as the budget needs to see it: an id and the tags it was given. */
export type ClaimableLoan = { id: string; tags: string[] };

/** A line, as loan ownership needs to see it. */
export type ClaimingLine = {
  id: string;
  rule: BudgetRule;
  /**
   * Whether this line's budget *is* a loan schedule.
   *
   * Such a line reads loans by their tags and never through a statement: it
   * exists because of the loan, so it has to know the loan before the first
   * instalment is paid, not after.
   */
  readsSchedule: boolean;
};

/**
 * Which line owns each loan, at most one apiece.
 *
 * Ownership is exclusive because spending is: a washing machine tagged as a
 * gift is claimed by Gifts, but it is also Shopping and also the catch-all at
 * the bottom, and a loan matched line by line would have its remaining
 * instalments counted once for each.
 *
 * Schedule lines are asked first, and read the loan's tags rather than any
 * statement. Such a line is a declaration that it *is* that loan, which is a
 * stronger claim than some line above it happening to match an instalment on
 * category -- left to position alone, a gym plan filed under Shopping would be
 * taken by Shopping and the Gym line would reconcile against nothing.
 *
 * Every other line then reads the statements it has claimed, in position order,
 * so ordinary precedence is unchanged. Anything still unowned falls back to
 * tags, which is what lets a loan signed this morning land somewhere at all.
 */
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
