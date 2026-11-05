import { expect, test, vi } from 'vitest';

import { nextCoveredEnd } from './market-cache';

vi.mock('@/lib/env', () => ({ env: {} }));
vi.mock('@/lib/db', () => ({ db: {} }));

const point = (day: string) => ({ date: new Date(`${day}T00:00:00.000Z`), price: 100 });

test('stops at the last day received so a late price is fetched again', () => {
  expect(
    nextCoveredEnd('2026-11-02', '2026-11-04', [point('2026-11-02'), point('2026-11-03')]),
  ).toBe('2026-11-03');
});

test('reaches the settled day once its price has arrived', () => {
  expect(nextCoveredEnd('2026-11-03', '2026-11-04', [point('2026-11-04')])).toBe('2026-11-04');
});

test('never covers a day still in progress', () => {
  expect(nextCoveredEnd('2026-11-03', '2026-11-04', [point('2026-11-05')])).toBe('2026-11-04');
});

test('does not move back when an older range is filled in', () => {
  expect(nextCoveredEnd('2026-11-04', '2026-11-04', [point('2026-10-01')])).toBe('2026-11-04');
});

test('keeps the coverage when nothing arrives', () => {
  expect(nextCoveredEnd('2026-11-03', '2026-11-04', [])).toBe('2026-11-03');
  expect(nextCoveredEnd(null, '2026-11-04', [])).toBe('2026-11-04');
});
