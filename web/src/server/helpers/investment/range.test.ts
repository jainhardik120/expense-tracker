import { expect, test, vi } from 'vitest';

import { buildDailyPriceSeries, endAtLastPriceDay, getChartBounds, latestSession } from './range';

vi.mock('@/lib/env', () => ({ env: {} }));

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const points = ['2026-11-03', '2026-11-04', '2026-11-05'].map((value) => ({ date: day(value) }));

const lastDay = (priceDates: Array<Date | null | undefined>) =>
  endAtLastPriceDay(points, priceDates).at(-1)?.date.toISOString().slice(0, 10);

test('ends the line on the last day a price exists for', () => {
  expect(lastDay([day('2026-11-04'), day('2026-11-03')])).toBe('2026-11-04');
});

test('reaches today as soon as any fund has a price for it', () => {
  expect(lastDay([day('2026-11-04'), day('2026-11-05')])).toBe('2026-11-05');
});

test('keeps every point when no price date is known', () => {
  expect(lastDay([null, undefined])).toBe('2026-11-05');
});

test('keeps the points rather than emptying the chart', () => {
  expect(lastDay([day('2026-10-01')])).toBe('2026-11-05');
});

const series = (rawPoints: Array<{ date: Date; price: number }>, fallbackPrice?: number) =>
  buildDailyPriceSeries({
    rawPoints,
    startDate: day('2026-05-10'),
    endDate: day('2026-05-12'),
    fallbackPrice,
  }).map(({ price }) => price);

test('a range starting on a closed day opens at the last real close, not the fallback', () => {
  const closes = [
    { date: day('2026-05-08'), price: 96.57 },
    { date: day('2026-05-11'), price: 98.72 },
  ];
  expect(series(closes, 66.45)).toEqual([96.57, 98.72, 98.72]);
});

test('uses the fallback only when no earlier price exists', () => {
  expect(series([{ date: day('2026-05-11'), price: 98.72 }], 66.45)).toEqual([66.45, 98.72, 98.72]);
});

const time = (value: string) => ({ date: new Date(`${value}Z`) });

test('keeps the last session and the close before it', () => {
  const points = [
    time('2026-11-04T09:00:00'),
    time('2026-11-04T10:00:00'),
    time('2026-11-05T03:45:00'),
    time('2026-11-05T03:50:00'),
  ];
  expect(latestSession(points)).toEqual(points.slice(1));
});

test('falls back to the last day for a market with no overnight break', () => {
  const points = [
    time('2026-11-03T10:00:00'),
    time('2026-11-03T12:00:00'),
    time('2026-11-04T09:00:00'),
    time('2026-11-04T11:00:00'),
  ];
  expect(latestSession(points)).toEqual(points.slice(1));
});

const bought = [{ investmentDate: new Date('2026-01-15T06:30:00.000Z') }];

const fiveYearStart = (hasPriceHistory: boolean) => {
  vi.useFakeTimers({ now: new Date('2026-11-06T12:00:00.000Z') });
  const { startDate } = getChartBounds('5y', bought, hasPriceHistory);
  vi.useRealTimers();
  return startDate.toISOString().slice(0, 10);
};

test('reaches past the first buy when the instrument has market prices', () => {
  expect(fiveYearStart(true)).toBe('2021-11-08');
});

test('stops at the first buy when there is nothing to show before it', () => {
  expect(fiveYearStart(false)).toBe('2026-01-15');
});
