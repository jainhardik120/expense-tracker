import { expect, test } from 'vitest';

import { matchesRule, assignToLine } from './budget-rules';

const empty = {
  categories: [],
  tags: [],
  accounts: [],
  statementKinds: [],
  maxAmount: null,
  minAmount: null,
};
const stmt = (over = {}) => ({
  category: 'Shopping',
  tags: ['Gift'],
  statementKind: 'expense',
  amount: 500,
  accountRefs: ['acct-1'],
  ...over,
});

test('an empty rule claims everything, so a catch-all line works', () => {
  expect(matchesRule(stmt(), empty)).toBe(true);
  expect(matchesRule(stmt({ category: null, tags: [], accountRefs: [null] }), empty)).toBe(true);
});

test('fields are ANDed, values within a field are ORed', () => {
  expect(matchesRule(stmt(), { ...empty, categories: ['Food', 'Shopping'] })).toBe(true);
  expect(matchesRule(stmt(), { ...empty, categories: ['Food'] })).toBe(false);
  // category matches but the tag does not
  expect(matchesRule(stmt(), { ...empty, categories: ['Shopping'], tags: ['Flight'] })).toBe(false);
});

test('any one of the account references on a statement can match', () => {
  const transfer = stmt({ accountRefs: [null, 'from-1', 'to-2'] });
  expect(matchesRule(transfer, { ...empty, accounts: ['to-2'] })).toBe(true);
  expect(matchesRule(transfer, { ...empty, accounts: ['other'] })).toBe(false);
});

test('first line wins, so a gift does not also count as shopping', () => {
  const lines = [
    { name: 'Gifts', rule: { ...empty, tags: ['Gift'] } },
    { name: 'Shopping', rule: { ...empty, categories: ['Shopping'] } },
    { name: 'Everything else', rule: empty },
  ];
  expect(assignToLine(stmt(), lines)).toBe(0);
  expect(assignToLine(stmt({ tags: [] }), lines)).toBe(1);
  expect(assignToLine(stmt({ tags: [], category: 'Food' }), lines)).toBe(2);
});

test('nothing claims a statement when no line matches and there is no catch-all', () => {
  const lines = [{ name: 'Flights', rule: { ...empty, tags: ['Flight'] } }];
  expect(assignToLine(stmt(), lines)).toBe(-1);
});

test('an amount ceiling tells a regular salary apart from the bonus it arrives with', () => {
  const regular = stmt({ amount: 125183, category: 'Salary' });
  const withBonus = stmt({ amount: 368035, category: 'Salary' });
  const rule = { ...empty, categories: ['Salary'], maxAmount: 140000 };
  expect(matchesRule(regular, rule)).toBe(true);
  expect(matchesRule(withBonus, rule)).toBe(false);
});
