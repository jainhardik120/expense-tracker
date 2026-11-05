import { expect, test } from 'vitest';

import { splitFund, splitStock } from './market-split';

import type { StoredFund, StoredStock } from './store';

const holding = (
  weightPercent: number,
  assetType: string,
  stockRef: string | null = null,
  instrument: string | null = null,
) => ({
  companyName: stockRef ?? 'x',
  stockRef,
  sector: null,
  assetType,
  instrument,
  rating: null,
  weightPercent,
  marketValueCrore: null,
});

const fund = (holdings: StoredFund['holdings']) => ({ holdings }) as StoredFund;

const stock = (marketCapCrore: number | null): StoredStock => ({
  name: null,
  industry: null,
  marketCapCrore,
});

const stocks = new Map([
  ['big', stock(500_000)],
  ['mid', stock(50_000)],
  ['small', stock(5000)],
]);

const toMap = (parts: ReturnType<typeof splitFund>) =>
  Object.fromEntries(parts.map((part) => [part.bucket, part.share]));

test('splits equity by market cap and other assets by type', () => {
  const parts = splitFund(
    fund([
      holding(40, 'EQUITY', 'big'),
      holding(20, 'EQUITY', 'mid'),
      holding(10, 'EQUITY', 'small'),
      holding(20, 'DEBT'),
      holding(5, 'CASH'),
      holding(5, 'REALEST'),
    ]),
    stocks,
  );
  expect(toMap(parts)).toEqual({
    'Large cap': 0.4,
    'Mid cap': 0.2,
    'Small cap': 0.1,
    Debt: 0.2,
    Cash: 0.05,
    'Real estate': 0.05,
  });
});

test('counts foreign equity and global funds as international', () => {
  const parts = splitFund(
    fund([
      holding(50, 'EQUITY', null, 'Foreign - Equity'),
      holding(25, 'EQUITY', null, 'ADS/ADR'),
      holding(25, 'GLOBAL_MF'),
    ]),
    stocks,
  );
  expect(toMap(parts)).toEqual({ International: 1 });
});

test('holdings it cannot place go to other, including whatever the list leaves out', () => {
  const parts = splitFund(
    fund([holding(60, 'EQUITY', 'big'), holding(10, 'EQUITY', null, 'Futures')]),
    stocks,
  );
  expect(toMap(parts)).toEqual({ 'Large cap': 0.6, Other: 0.4 });
});

test('ignores a rounding gap in the published weights', () => {
  expect(toMap(splitFund(fund([holding(99.99998, 'EQUITY', 'big')]), stocks))).toEqual({
    'Large cap': 1,
  });
});

test('drops a net negative bucket and rescales so shares still total one', () => {
  const parts = splitFund(fund([holding(102.5, 'EQUITY', 'big'), holding(-2.5, 'CASH')]), stocks);
  expect(toMap(parts)).toEqual({ 'Large cap': 1 });
});

test('a fund with no holdings is all other', () => {
  expect(splitFund(undefined, stocks)).toEqual([{ bucket: 'Other', share: 1 }]);
});

test('places a directly held stock by its market cap', () => {
  expect(splitStock(stock(1_300_000))).toEqual([{ bucket: 'Large cap', share: 1 }]);
  expect(splitStock(undefined)).toEqual([{ bucket: 'Other', share: 1 }]);
});
