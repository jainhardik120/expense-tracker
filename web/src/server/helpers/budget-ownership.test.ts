import { describe, expect, test } from 'vitest';

import { emptyBudgetRule, type BudgetRule } from '@/types/budget';

import {
  summariseByCycle,
  summariseIncome,
  summariseLines,
  type BudgetIncomeLineRow,
  type BudgetLineRow,
  type ScopedStatement,
} from './budget';

type Kind = 'expense' | 'outside_transaction' | 'friend_transaction' | 'self_transfer';

const row = (
  id: string,
  statementKind: Kind,
  amount: number,
  {
    accountId = 'bank' as string | null,
    category = 'Other',
    tags = [] as string[],
    myAmount = amount,
  } = {},
): ScopedStatement => ({
  id,
  createdAt: new Date('2026-07-03T00:00:00Z'),
  category,
  tags,
  statementKind,
  amount,
  emiId: null,
  emiName: null,
  installment: null,
  accountId,
  accountRefs: [accountId, statementKind === 'friend_transaction' ? 'mummy' : null],
  myAmount,
  costAmount: statementKind === 'outside_transaction' ? -myAmount : myAmount,
});

const spend = (id: string, rule: Partial<BudgetRule>, position: number): BudgetLineRow => ({
  id,
  budgetYearId: 'year',
  name: id,
  position,
  rule: { ...emptyBudgetRule, ...rule },
  allocationKind: 'monthly',
  allocationAmount: '0',
  discretionary: true,
  closed: false,
  createdAt: new Date('2026-01-01'),
});

const income = (
  id: string,
  rule: Partial<BudgetRule>,
  position: number,
  destination: BudgetIncomeLineRow['destination'] = 'waterfall',
): BudgetIncomeLineRow => ({
  id,
  budgetYearId: 'year',
  name: id,
  position,
  rule: { ...emptyBudgetRule, ...rule },
  source: 'statements',
  destination,
  destinationLineId: destination === 'line' ? 'shopping' : null,
  createdAt: new Date('2026-01-01'),
});

const run = (
  lines: BudgetLineRow[],
  incomeLines: BudgetIncomeLineRow[],
  scoped: ScopedStatement[],
) => {
  const { totals, unclaimed } = summariseLines(lines, scoped);
  const summary = summariseIncome(incomeLines, scoped, new Set(unclaimed.map((item) => item.id)));
  const actual = Object.fromEntries(totals.map((total) => [total.lineId, total.actual]));
  const claimed = Object.fromEntries(summary.claimedByLine);
  return { actual, claimed, summary, unclaimed };
};

describe('each statement counts on one side only', () => {
  const everything = { statementKinds: [] };

  test('expenses only ever reach budget lines, even when an income rule matches them', () => {
    const treat = row('treat', 'expense', 900, { tags: ['Bonus'] });
    const { actual, claimed, summary } = run(
      [spend('living', { statementKinds: ['expense'] }, 0)],
      [income('bonus', { tags: ['Bonus'] }, 0)],
      [treat],
    );
    expect(actual.living).toBe(900);
    expect(claimed.bonus).toBeUndefined();
    expect(summary.waterfall).toBe(0);
  });

  test('an outside transaction a budget line takes never also counts as income', () => {
    const invested = row('sip', 'outside_transaction', -25000, { category: 'Investment' });
    const { actual, claimed, summary } = run(
      [
        spend(
          'investment',
          { categories: ['Investment'], statementKinds: ['outside_transaction'] },
          0,
        ),
      ],
      [income('outside', { statementKinds: ['outside_transaction'] }, 0, 'line')],
      [invested],
    );
    expect(actual.investment).toBe(25000);
    expect(claimed.outside).toBeUndefined();
    expect(summary.earmarked.get('shopping')).toBeUndefined();
  });

  test('a misordered catch-all income line can no longer swallow investments', () => {
    const invested = row('sip', 'outside_transaction', -25000, { category: 'Investment' });
    const salary = row('salary', 'outside_transaction', 125183, { category: 'Salary' });
    const { actual, summary } = run(
      [
        spend(
          'investment',
          { categories: ['Investment'], statementKinds: ['outside_transaction'] },
          0,
        ),
      ],
      [
        income('outside', { statementKinds: ['outside_transaction'] }, 0, 'line'),
        income('investments', { categories: ['Investment'] }, 1, 'excluded'),
      ],
      [invested, salary],
    );
    expect(actual.investment).toBe(25000);
    expect(summary.earmarked.get('shopping')).toBe(125183);
  });

  test('outside transactions no budget line takes go to income lines', () => {
    const cashback = row('cashback', 'outside_transaction', 96, { category: 'Credit' });
    const { claimed, summary } = run(
      [spend('living', { statementKinds: ['expense'] }, 0)],
      [income('outside', { statementKinds: ['outside_transaction'] }, 0, 'line')],
      [cashback],
    );
    expect(claimed.outside).toBe(96);
    expect(summary.earmarked.get('shopping')).toBe(96);
  });

  test('friend entries with no account go to a budget line first, the rest to income as negative', () => {
    const home = row('home', 'friend_transaction', 50000, { accountId: null, category: 'Salary' });
    const gift = row('gift', 'friend_transaction', 959.26, { accountId: null, category: 'Credit' });
    const forgiven = row('forgiven', 'friend_transaction', -74.78, {
      accountId: null,
      category: 'Debit',
    });
    const { actual, claimed, summary } = run(
      [spend('home', { categories: ['Salary'], statementKinds: ['friend_transaction'] }, 0)],
      [income('given', { statementKinds: ['friend_transaction'] }, 0, 'line')],
      [home, gift, forgiven],
    );
    expect(actual.home).toBe(50000);
    expect(claimed.given).toBeCloseTo(-884.48, 2);
    expect(summary.earmarked.get('shopping')).toBeCloseTo(-884.48, 2);
  });

  test('settling up with a friend from a bank account counts nowhere', () => {
    const settlement = row('settle', 'friend_transaction', 20000, { tags: ['Gift'] });
    const { actual, claimed, unclaimed, summary } = run(
      [spend('gifts', { tags: ['Gift'], statementKinds: ['friend_transaction'] }, 0)],
      [income('given', { statementKinds: ['friend_transaction'] }, 0)],
      [settlement],
    );
    expect(actual.gifts).toBe(0);
    expect(claimed.given).toBeUndefined();
    expect(summary.unmatched).toEqual([]);
    expect(unclaimed.map((item) => item.id)).toEqual(['settle']);
  });

  test('self transfers count nowhere, even in a line with no rule at all', () => {
    const transfer = row('move', 'self_transfer', 5000);
    const { actual, summary } = run(
      [spend('anything', everything, 0)],
      [income('anything', everything, 0)],
      [transfer],
    );
    expect(actual.anything).toBe(0);
    expect(summary.waterfall).toBe(0);
    expect(summary.unmatched).toEqual([]);
  });

  test('income candidates no income line matches are reported as unmatched', () => {
    const gift = row('gift', 'friend_transaction', 639, { accountId: null, category: 'Credit' });
    const refund = row('refund', 'outside_transaction', 300);
    const { summary } = run(
      [spend('living', { statementKinds: ['expense'] }, 0)],
      [income('salary', { categories: ['Salary'] }, 0)],
      [gift, refund],
    );
    expect(
      summary.unmatched.map((item) => item.id).toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(['gift', 'refund']);
  });

  test('the per-cycle figures follow the same rule as the year totals', () => {
    const settlement = row('settle', 'friend_transaction', 20000);
    const meal = row('meal', 'expense', 250);
    const cycles = summariseByCycle(
      [spend('living', everything, 0)],
      [settlement, meal],
      23,
      'UTC',
    );
    expect(cycles.flatMap((cycle) => Object.values(cycle.perLine))).toEqual([250]);
  });
});
