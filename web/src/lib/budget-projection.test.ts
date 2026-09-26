/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises, no-magic-numbers */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  project,
  monthsBetween,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './budget-projection.ts';

const line = (over = {}) => ({
  lineId: 'l',
  name: 'Line',
  allocationKind: 'monthly' as const,
  allocationAmount: 1000,
  discretionary: true,
  actual: 0,
  earmarkedIncome: 0,
  scheduled: { year: 0, toDate: 0, remaining: 0 },
  pacePerMonth: 0,
  ...over,
});

test('a monthly allocation budgets for the whole year, not just so far', () => {
  const { lines } = project([line({ allocationAmount: 1000 })], 0, 3, 12);
  assert.equal(lines[0].yearBudget, 12000);
});

test('what is left is paced over the months that remain', () => {
  const { lines } = project([line({ allocationAmount: 1000, actual: 6000 })], 0, 6, 12);
  assert.equal(lines[0].remaining, 6000);
  assert.equal(lines[0].perMonthRemaining, 1000);
});

test('overspending is reported rather than floored at zero', () => {
  const { lines } = project(
    [line({ allocationKind: 'annual', allocationAmount: 60000, actual: 68740 })],
    0,
    10,
    12,
  );
  assert.equal(lines[0].remaining, -8740);
  assert.equal(lines[0].overspent, true);
});

test('an earmarked line is funded only by the income pointed at it', () => {
  const { lines } = project(
    [
      line({
        allocationKind: 'earmarked',
        allocationAmount: 0,
        earmarkedIncome: 28948,
        actual: 32460,
      }),
    ],
    0,
    10,
    12,
  );
  assert.equal(lines[0].yearBudget, 28948);
  assert.equal(lines[0].remaining, -3512);
});

test('income still to come is projected from the rate so far', () => {
  // 10 months of income at 100/month, two months left
  const p = project([line({ allocationAmount: 0 })], 1000, 10, 12);
  assert.equal(p.expectedTotalIncome, 1200);
  assert.equal(p.remainingMonths, 2);
});

test('the residual is whatever the lines above it leave, and shrinks when they overspend', () => {
  const thrifty = project(
    [
      line({ allocationAmount: 1000, actual: 10000 }),
      line({ lineId: 'r', allocationKind: 'residual' }),
    ],
    24000,
    10,
    12,
  );
  const spendy = project(
    [
      line({ allocationAmount: 1000, actual: 16000 }),
      line({ lineId: 'r', allocationKind: 'residual' }),
    ],
    24000,
    10,
    12,
  );
  // same income, 6000 more spent, so 6000 less survives
  assert.equal(thrifty.projectedResidual - spendy.projectedResidual, 6000);
  // and the goal itself is unchanged: allocation did not move, behaviour did
  assert.equal(thrifty.residualGoal, spendy.residualGoal);
});

test('months between dates counts part months', () => {
  assert.equal(monthsBetween(new Date('2026-01-01'), new Date('2026-04-01')), 3);
  assert.equal(Math.round(monthsBetween(new Date('2025-12-24'), new Date('2026-09-26'))), 9);
});

test('a fixed monthly line is projected to keep costing its rate', () => {
  // 1,000 a month, ten paid, two to run: 12,000 by December, exactly its budget
  const { lines } = project(
    [line({ allocationAmount: 1000, actual: 10000, discretionary: false })],
    0,
    10,
    12,
  );
  assert.equal(lines[0].forecastRemaining, 2000);
  assert.equal(lines[0].projectedSpend, 12000);
  assert.equal(lines[0].variance, 0);
});

test('a discretionary line is forecast at the rate it is actually running at', () => {
  // budget 9,300 a month; running at 11,400 with two months to go
  const { lines } = project(
    [line({ allocationAmount: 9300, actual: 113968, pacePerMonth: 11400 })],
    0,
    10,
    12,
  );
  assert.equal(lines[0].yearBudget, 111600);
  assert.equal(lines[0].forecastRemaining, 22800);
  assert.equal(Math.round(lines[0].variance), 25168);
});

test('income earmarked at a line funds it rather than showing as overspend', () => {
  // a trip paid for out of a bonus: 28,948 pointed at it, 32,460 spent
  const { lines } = project(
    [
      line({
        allocationKind: 'earmarked',
        allocationAmount: 0,
        earmarkedIncome: 28948,
        actual: 32460,
      }),
    ],
    0,
    10,
    12,
  );
  assert.equal(lines[0].yearBudget, 28948);
  assert.equal(lines[0].variance, 3512);
});

test('an envelope topped up by earmarked income is bigger than the figure typed in', () => {
  // 60,000 shopping plus 9,580 of cashbacks, 68,740 spent: under, not over
  const { lines } = project(
    [
      line({
        allocationKind: 'annual',
        allocationAmount: 60000,
        earmarkedIncome: 9579.71,
        actual: 68739.85,
      }),
    ],
    0,
    10,
    12,
  );
  // spent a touch under and nothing more planned, so it closes just under
  assert.equal(Math.round(lines[0].variance), 0);
});

test('spending an envelope early is not overspending it', () => {
  // the whole year's flight budget used by March
  const { lines } = project(
    [line({ allocationKind: 'annual', allocationAmount: 60000, actual: 60000 })],
    0,
    3,
    12,
  );
  assert.equal(lines[0].variance, 0);
});

test('a schedule line is budgeted from the instalments that fall inside the year', () => {
  // a plan started in March runs nine of its months before the year closes
  const { lines } = project(
    [
      line({
        allocationKind: 'schedule',
        allocationAmount: 0,
        scheduled: { year: 36900, toDate: 24903, remaining: 11997 },
        actual: 24903,
      }),
    ],
    0,
    10,
    12,
  );
  assert.equal(lines[0].yearBudget, 36900);
  // the instalments still to fall are added, so it lands exactly on its schedule
  assert.equal(lines[0].projectedSpend, 36900);
  assert.equal(lines[0].variance, 0);
});

test('unspent rent is saved, unspent envelope is reserved', () => {
  const { lines } = project(
    [
      line({ lineId: 'rent', allocationKind: 'monthly', allocationAmount: 22000, actual: 219000 }),
      line({ lineId: 'flights', allocationKind: 'annual', allocationAmount: 60000, actual: 37640 }),
    ],
    0,
    10,
    12,
  );
  assert.equal(lines[0].unspentIsSaved, true);
  assert.equal(lines[1].unspentIsSaved, false);
});
