/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  matchesRule,
  assignToLine,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './budget-rules.ts';

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
  assert.equal(matchesRule(stmt(), empty), true);
  assert.equal(matchesRule(stmt({ category: null, tags: [], accountRefs: [null] }), empty), true);
});

test('fields are ANDed, values within a field are ORed', () => {
  assert.equal(matchesRule(stmt(), { ...empty, categories: ['Food', 'Shopping'] }), true);
  assert.equal(matchesRule(stmt(), { ...empty, categories: ['Food'] }), false);
  // category matches but the tag does not
  assert.equal(
    matchesRule(stmt(), { ...empty, categories: ['Shopping'], tags: ['Flight'] }),
    false,
  );
});

test('any one of the account references on a statement can match', () => {
  const transfer = stmt({ accountRefs: [null, 'from-1', 'to-2'] });
  assert.equal(matchesRule(transfer, { ...empty, accounts: ['to-2'] }), true);
  assert.equal(matchesRule(transfer, { ...empty, accounts: ['other'] }), false);
});

test('first line wins, so a gift does not also count as shopping', () => {
  const lines = [
    { name: 'Gifts', rule: { ...empty, tags: ['Gift'] } },
    { name: 'Shopping', rule: { ...empty, categories: ['Shopping'] } },
    { name: 'Everything else', rule: empty },
  ];
  assert.equal(assignToLine(stmt(), lines), 0);
  assert.equal(assignToLine(stmt({ tags: [] }), lines), 1);
  assert.equal(assignToLine(stmt({ tags: [], category: 'Food' }), lines), 2);
});

test('nothing claims a statement when no line matches and there is no catch-all', () => {
  const lines = [{ name: 'Flights', rule: { ...empty, tags: ['Flight'] } }];
  assert.equal(assignToLine(stmt(), lines), -1);
});

test('an amount ceiling tells a regular salary apart from the bonus it arrives with', () => {
  const regular = stmt({ amount: 125183, category: 'Salary' });
  const withBonus = stmt({ amount: 368035, category: 'Salary' });
  const rule = { ...empty, categories: ['Salary'], maxAmount: 140000 };
  assert.equal(matchesRule(regular, rule), true);
  assert.equal(matchesRule(withBonus, rule), false);
});
