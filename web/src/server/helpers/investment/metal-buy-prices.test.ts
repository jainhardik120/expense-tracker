import { expect, test } from 'vitest';

import { averageBuyPrices } from './metal-buy-prices';

const buy = (code: string, day: string, units: number, amount: number) => ({
  code,
  day,
  units,
  amount,
});

const conversions = new Map<string, number | null>([
  ['BIG', 1000],
  ['SMALL', 10_000],
]);

test('weighs ETFs of different unit sizes by the metal they hold', () => {
  const result = averageBuyPrices(
    [buy('BIG', '2026-07-01', 100, 12_000), buy('SMALL', '2026-07-01', 3000, 42_000)],
    conversions,
    new Map(),
  );
  expect(result.etf).toBeCloseTo(135_000);
});

test('averages the MCX close of each buy day by metal quantity', () => {
  const result = averageBuyPrices(
    [buy('BIG', '2026-07-01', 100, 12_000), buy('BIG', '2026-08-03', 300, 39_000)],
    conversions,
    new Map([
      ['2026-07-01', 120_000],
      ['2026-08-03', 140_000],
    ]),
  );
  expect(result.mcx).toBeCloseTo(135_000);
  expect(result.mcxCoverage).toBeCloseTo(100);
});

test('uses the last close for a buy on a day MCX did not trade', () => {
  const result = averageBuyPrices(
    [buy('BIG', '2026-08-02', 100, 12_000)],
    conversions,
    new Map([['2026-07-31', 125_000]]),
  );
  expect(result.mcx).toBe(125_000);
});

test('leaves buys from before the MCX history out and reports the coverage', () => {
  const result = averageBuyPrices(
    [buy('BIG', '2026-01-10', 100, 12_000), buy('BIG', '2026-07-01', 300, 39_000)],
    conversions,
    new Map([['2026-07-01', 130_000]]),
  );
  expect(result.mcx).toBe(130_000);
  expect(result.mcxCoverage).toBeCloseTo(75);
  expect(result.etf).toBeCloseTo(127_500);
});

test('skips an ETF with no conversion and returns nothing without buys', () => {
  expect(averageBuyPrices([buy('NEW', '2026-07-01', 1, 100)], conversions, new Map())).toEqual({
    etf: null,
    mcx: null,
    mcxCoverage: 0,
  });
});
