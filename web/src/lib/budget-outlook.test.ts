/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises, no-magic-numbers */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOutlook,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './budget-outlook.ts';

// The figures worked out by hand: 34,429.74 on hand, two salaries left at
// 125,458 less 72,000 of rent and money home, 30,814 of loan installments, and
// 22,084 of flight budget held back for one more trip home.
const afternoon = {
  balanceToday: 34429.74,
  monthlyIncome: 125458,
  incomeCyclesRemaining: 2,
  monthsRemaining: 3,
  fixedPerMonth: 72000,
  emiRemaining: 30814,
  envelopesRemaining: 22084,
  livingPerMonthActual: 16006,
  livingPerMonthBudget: 13000,
  investedSoFar: 209268.35,
  investmentGoal: 270000,
};

test('the running balance reaches what was worked out by hand', () => {
  const o = buildOutlook(afternoon);
  assert.equal(Math.round(o.incomeRemaining), 250916);
  assert.equal(Math.round(o.totalAvailable), 285346);
  assert.equal(Math.round(o.fixedRemaining), 144000);
  // 285,346 - 144,000 - 30,814 - 22,084
  assert.equal(Math.round(o.afterCommitments), 88448);
});

test('spending at the budgeted pace invests more than spending at the current one', () => {
  const o = buildOutlook(afternoon);
  assert.ok(o.atBudgetPace.invests > o.atCurrentPace.invests);
  // three months of the 3,006 overspend, and no more
  assert.equal(
    Math.round(o.atBudgetPace.invests - o.atCurrentPace.invests),
    Math.round((16006 - 13000) * 3),
  );
});

test('two salaries left but three months to live through are counted separately', () => {
  const o = buildOutlook(afternoon);
  // income and the fixed outgoings follow the two remaining salaries ...
  assert.equal(Math.round(o.incomeRemaining), 125458 * 2);
  assert.equal(o.fixedRemaining, 72000 * 2);
  // ... while spending is paced over the three months still to be lived in
  assert.equal(Math.round(o.atBudgetPace.living), 13000 * 3);
});

test('the safe monthly figure is what is left once the goal is set aside', () => {
  const o = buildOutlook(afternoon);
  const spent = o.safeToSpendPerMonth * 3;
  // spending exactly that lands on the goal
  assert.equal(Math.round(o.afterCommitments - spent + o.investedSoFar), Math.round(270000));
});

test('a goal already met leaves everything else spendable', () => {
  const o = buildOutlook({ ...afternoon, investedSoFar: 300000 });
  assert.equal(Math.round(o.safeToSpendPerMonth * 3), Math.round(o.afterCommitments));
});
