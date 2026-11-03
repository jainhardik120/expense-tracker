import { expect, test } from 'vitest';

import { benchmarkTimeline, compareWithBenchmark } from './benchmark';

const day = (value: string) => new Date(`${value}T00:00:00Z`);

test('compareWithBenchmark buys index units on each buy date and values them today', () => {
  const history = [
    { date: day('2026-01-01'), price: 100 },
    { date: day('2026-01-02'), price: 110 },
    { date: day('2026-06-01'), price: 120 },
  ];
  const result = compareWithBenchmark(
    [
      { schemeCode: 'a', date: day('2026-01-01'), amount: 1000 },
      { schemeCode: 'b', date: day('2026-01-03'), amount: 1100 },
    ],
    history,
    132,
    day('2026-11-01'),
  );
  expect(result.byFund.get('a')?.indexValue).toBeCloseTo(1320);
  expect(result.byFund.get('b')?.indexValue).toBeCloseTo(1320);
  expect(result.total.invested).toBe(2100);
  expect(result.total.indexValue).toBeCloseTo(2640);
  expect(result.total.indexXirr).toBeGreaterThan(0);
});

test('compareWithBenchmark uses the first NAV for buys before the history starts', () => {
  const result = compareWithBenchmark(
    [{ schemeCode: 'a', date: day('2025-12-01'), amount: 500 }],
    [{ date: day('2026-01-01'), price: 50 }],
    60,
    day('2026-11-01'),
  );
  expect(result.total.indexValue).toBeCloseTo(600);
});

test('benchmarkTimeline values each fund and the index on every index day after the first buy', () => {
  const index = [
    { date: day('2026-01-01'), price: 100 },
    { date: day('2026-01-02'), price: 110 },
    { date: day('2026-01-03'), price: 90 },
  ];
  const fund = [
    { date: day('2026-01-01'), price: 10 },
    { date: day('2026-01-02'), price: 12 },
    { date: day('2026-01-03'), price: 12 },
  ];
  const points = benchmarkTimeline(
    [{ schemeCode: 'a', date: day('2026-01-02'), amount: 1200, units: 100 }],
    new Map([['a', fund]]),
    index,
  );
  expect(points.map((point) => point.date.toISOString().slice(0, 10))).toEqual([
    '2026-01-02',
    '2026-01-03',
  ]);
  expect(points[1]?.value).toBe(1200);
  expect(points[1]?.indexValue).toBeCloseTo((1200 / 110) * 90);
});
