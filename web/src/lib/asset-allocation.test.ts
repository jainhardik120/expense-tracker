import { expect, test } from 'vitest';

import { buildAllocation, expandRing } from './asset-allocation';

const entry = (
  instrumentKey: string,
  kind: 'mutual_funds' | 'stocks',
  assetClass: 'market' | 'gold',
  value: number,
  invested: number,
  dayChange: number,
) => ({
  instrumentKey,
  kind,
  assetClass,
  valuationAmount: value,
  investedAmount: invested,
  dayChange,
});

const fund = entry('mutual_funds:1', 'mutual_funds', 'market', 1000, 800, 40);
const stock = entry('stocks:IN:JPL', 'stocks', 'market', 200, 100, 2);
const gold = entry('stocks:IN:GOLD', 'stocks', 'gold', 3000, 2000, -60);
const splits = [
  {
    instrumentKey: 'mutual_funds:1',
    parts: [
      { bucket: 'Large cap' as const, share: 0.75 },
      { bucket: 'Debt' as const, share: 0.25 },
    ],
  },
  { instrumentKey: 'stocks:IN:JPL', parts: [{ bucket: 'Large cap' as const, share: 1 }] },
];

test('splits market by kind and by bucket, leaving other classes whole', () => {
  const groups = buildAllocation([fund, stock, gold], splits);
  expect(groups.at(0)).toMatchObject({ key: 'gold', value: 3000, kinds: [], buckets: [] });
  const market = groups.at(1);
  expect(market).toMatchObject({ key: 'market', value: 1200, invested: 900, dayChange: 42 });
  expect(market?.kinds).toMatchObject([
    { label: 'Mutual funds', value: 1000, invested: 800, dayChange: 40 },
    { label: 'Stocks', value: 200, invested: 100, dayChange: 2 },
  ]);
});

test('combines a bucket across funds and stocks', () => {
  const market = buildAllocation([fund, stock], splits).at(0);
  expect(market?.buckets).toMatchObject([
    { label: 'Large cap', value: 950, invested: 700, dayChange: 32 },
    { label: 'Debt', value: 250, invested: 200, dayChange: 10 },
  ]);
});

test('a tagged stock stays out of the market kinds', () => {
  const market = buildAllocation([stock, gold], splits).find((group) => group.key === 'market');
  expect(market?.kinds.map((kind) => kind.value)).toEqual([200]);
});

test('every ring covers the same total so the rings line up', () => {
  const middle = buildAllocation([fund, stock, gold], splits);
  const totalOf = (ring: Array<{ value: number }>) =>
    ring.reduce((sum, slice) => sum + slice.value, 0);
  expect(totalOf(expandRing(middle, 'kinds'))).toBe(totalOf(middle));
  expect(totalOf(expandRing(middle, 'buckets'))).toBe(totalOf(middle));
  expect(expandRing(middle, 'buckets').map((slice) => slice.label)).toEqual([
    'Gold',
    'Large cap',
    'Debt',
  ]);
});

test('shows kinds but no buckets until the splits load', () => {
  const market = buildAllocation([fund, stock], undefined).at(0);
  expect(market?.kinds.map((kind) => kind.label)).toEqual(['Mutual funds', 'Stocks']);
  expect(market?.buckets).toEqual([]);
});

test('treats an instrument without a split as other', () => {
  const market = buildAllocation([fund], []).at(0);
  expect(market?.buckets).toMatchObject([{ label: 'Other', value: 1000 }]);
});
