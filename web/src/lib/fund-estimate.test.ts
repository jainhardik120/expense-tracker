import { expect, test } from 'vitest';

import { estimateFundsToday } from './fund-estimate';

const row = (kind: string, code: string, valuationAmountInr: number, openPositions = 1) => ({
  kind,
  code,
  openPositions,
  valuationAmountInr,
});

test('applies each fund move to its current value', () => {
  const rows = [row('mutual_funds', 'A', 1000), row('mutual_funds', 'B', 2000)];
  expect(estimateFundsToday(rows, { A: 1, B: -0.5 })).toBeCloseTo(0);
  expect(estimateFundsToday(rows, { A: 2 })).toBeCloseTo(20);
});

test('ignores closed funds and other instruments', () => {
  const rows = [row('mutual_funds', 'A', 1000, 0), row('stocks', 'B', 2000)];
  expect(estimateFundsToday(rows, { A: 1, B: 1 })).toBeNull();
});

test('returns nothing once no fund has an estimate', () => {
  expect(estimateFundsToday([row('mutual_funds', 'A', 1000)], {})).toBeNull();
});
