import { expect, test, vi } from 'vitest';

import { endAtLastPriceDay } from './range';

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
