import { expect, test } from 'vitest';

import { analyseMutualFunds, capBucketFor, fundOverlap } from './analysis';

import type { StoredFund } from './store';

const holding = (companyName: string, weightPercent: number, assetType = 'EQUITY') => ({
  companyName,
  stockRef: assetType === 'EQUITY' ? companyName.toLowerCase() : null,
  sector: 'Financial',
  assetType,
  instrument: null,
  rating: null,
  weightPercent,
  marketValueCrore: null,
});

const fund = (schemeCode: string, holdings: StoredFund['holdings']): StoredFund => ({
  schemeCode,
  schemeName: `Fund ${schemeCode}`,
  fundHouse: 'House',
  category: 'Equity',
  subCategory: 'Large Cap',
  expenseRatio: 1,
  aumCrore: 1000,
  benchmark: null,
  portfolioTurnover: null,
  returnStats: null,
  portfolioDate: new Date('2026-09-30T00:00:00Z'),
  fetchedAt: new Date('2026-11-01T00:00:00Z'),
  holdings,
});

test('capBucketFor sizes equity by market cap and leaves other assets out', () => {
  expect(capBucketFor('EQUITY', 150_000)).toBe('Large cap');
  expect(capBucketFor('EQUITY', 50_000)).toBe('Mid cap');
  expect(capBucketFor('EQUITY', 5_000)).toBe('Small cap');
  expect(capBucketFor('EQUITY', null)).toBe('Unknown size');
  expect(capBucketFor('DEBT', 150_000)).toBe('Not equity');
});

test('fundOverlap counts shared equity weight and ignores hedged negative weights', () => {
  const hedged = fund('a', [holding('HDFC', 10), holding('ICICI', 5), holding('Hedge', -3)]);
  const plain = fund('b', [holding('HDFC', 6), holding('Infosys', 8), holding('Hedge', 2)]);
  expect(fundOverlap(hedged, plain)).toBe(6);
  expect(fundOverlap(plain, hedged)).toBe(6);
});

test('analyseMutualFunds adds each fund holding up across funds in rupees', () => {
  const funds = new Map([
    ['a', fund('a', [holding('HDFC', 50), holding('Bond', 50, 'DEBT')])],
    ['b', fund('b', [holding('HDFC', 100)])],
  ]);
  const analysis = analyseMutualFunds(
    [
      {
        schemeCode: 'a',
        schemeName: 'A',
        value: 1000,
        invested: 900,
        xirr: null,
        navChange: 10,
        navDate: null,
      },
      {
        schemeCode: 'b',
        schemeName: 'B',
        value: 500,
        invested: 500,
        xirr: null,
        navChange: -5,
        navDate: null,
      },
    ],
    funds,
    new Map([['hdfc', { name: 'HDFC Bank', industry: 'Banks', marketCapCrore: 1_000_000 }]]),
  );
  const hdfc = analysis.companies.find((company) => company.key === 'hdfc');
  expect(hdfc?.value).toBe(1000);
  expect(hdfc?.funds.map((item) => item.value)).toEqual([500, 500]);
  expect(analysis.totals.equityShare).toBeCloseTo((1000 / 1500) * 100);
  expect(analysis.totals.yearlyCost).toBe(15);
  expect(analysis.overlap.matrix[0]?.[1]).toBe(50);
});
