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
  const { lines } = project([line({ allocationKind: 'annual', allocationAmount: 60000, actual: 68740 })], 0, 10, 12);
  assert.equal(lines[0].remaining, -8740);
  assert.equal(lines[0].overspent, true);
});

test('an earmarked line is funded only by the income pointed at it', () => {
  const { lines } = project(
    [line({ allocationKind: 'earmarked', allocationAmount: 0, earmarkedIncome: 28948, actual: 32460 })],
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
    [line({ allocationAmount: 1000, actual: 10000 }), line({ lineId: 'r', allocationKind: 'residual' })],
    24000,
    10,
    12,
  );
  const spendy = project(
    [line({ allocationAmount: 1000, actual: 16000 }), line({ lineId: 'r', allocationKind: 'residual' })],
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
