import { expect, test } from 'vitest';

import { matchesRule, matchesByTags, assignToLine, resolveLoanOwners } from './budget-rules';

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

test('a commitment is claimed by its own tags, and only by an explicit tag', () => {
  expect(matchesByTags(['Flight'], { ...empty, tags: ['Flight'] })).toBe(true);
  expect(matchesByTags(['Flight', 'Vashni'], { ...empty, tags: ['Gift', 'Vashni'] })).toBe(true);
  expect(matchesByTags(['Flight'], { ...empty, tags: ['Gift'] })).toBe(false);
});

test('a catch-all line does not swallow untagged commitments', () => {
  expect(matchesRule(stmt({ tags: [] }), empty)).toBe(true);
  expect(matchesByTags([], empty)).toBe(false);
  expect(matchesByTags(['Flight'], empty)).toBe(false);
});

const loanLine = (over = {}) => ({ id: 'l', rule: { ...empty }, readsSchedule: false, ...over });
const instalment = (emiId: string, over = {}) => ({ ...stmt(over), emiId });

test('a schedule line knows its loan before a single instalment is recorded', () => {
  const owners = resolveLoanOwners(
    [loanLine({ id: 'gym', rule: { ...empty, tags: ['Gym EMI'] }, readsSchedule: true })],
    [{ id: 'emi-gym', tags: ['Gym EMI'] }],
    [],
  );
  expect(owners.get('emi-gym')).toBe('gym');
});

test('a schedule line ignores statements entirely', () => {
  const owners = resolveLoanOwners(
    [
      loanLine({ id: 'shopping', rule: { ...empty, categories: ['Shopping'] } }),
      loanLine({ id: 'gym', rule: { ...empty, tags: ['Gym EMI'] }, readsSchedule: true }),
    ],
    [{ id: 'emi-gym', tags: ['Gym EMI'] }],
    [instalment('emi-gym', { category: 'Shopping', tags: ['Gym EMI'] })],
  );
  expect(owners.get('emi-gym')).toBe('gym');
});

test('a loan lands on one line only, never on every rule that fits', () => {
  const owners = resolveLoanOwners(
    [
      loanLine({ id: 'gifts', rule: { ...empty, tags: ['Gift'] } }),
      loanLine({ id: 'shopping', rule: { ...empty, categories: ['Shopping'] } }),
      loanLine({ id: 'living', rule: { ...empty } }),
    ],
    [{ id: 'emi-wm', tags: [] }],
    [instalment('emi-wm', { category: 'Shopping', tags: ['Gift'] })],
  );
  expect([...owners.values()]).toEqual(['gifts']);
});

test('an untagged loan is never swept up by a catch-all line', () => {
  const owners = resolveLoanOwners(
    [loanLine({ id: 'living', rule: { ...empty } })],
    [{ id: 'emi-new', tags: [] }],
    [],
  );
  expect(owners.size).toBe(0);
});

test('naming a loan outranks a line above that merely matches its instalments', () => {
  const owners = resolveLoanOwners(
    [
      loanLine({ id: 'flights', rule: { ...empty, tags: ['Flight'] } }),
      loanLine({ id: 'trip', rule: { ...empty, tags: ['Flight'] }, readsSchedule: true }),
    ],
    [{ id: 'emi-fl', tags: ['Flight'] }],
    [instalment('emi-fl', { tags: ['Flight'] })],
  );
  expect(owners.get('emi-fl')).toBe('trip');
});

test('ordinary lines keep their precedence among themselves', () => {
  const owners = resolveLoanOwners(
    [
      loanLine({ id: 'gifts', rule: { ...empty, tags: ['Gift'] } }),
      loanLine({ id: 'shopping', rule: { ...empty, categories: ['Shopping'] } }),
    ],
    [{ id: 'emi-wm', tags: [] }],
    [instalment('emi-wm', { category: 'Shopping', tags: ['Gift'] })],
  );
  expect(owners.get('emi-wm')).toBe('gifts');
});
