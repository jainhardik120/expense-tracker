import { expect, test } from 'vitest';

import { withDatePart, withZonedDatePart } from './date-part';

const IST = 'Asia/Kolkata';

const stamp = (date: Date) =>
  [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].join('-');

test('keeps the picked day when it does not exist in the base month', () => {
  const base = new Date(2026, 8, 26, 14, 30, 15);
  expect(stamp(withDatePart(base, new Date(2026, 9, 31)))).toBe('2026-10-31-14-30-15');
  expect(stamp(withDatePart(base, new Date(2026, 7, 31)))).toBe('2026-8-31-14-30-15');
});

test('carries the picked day across a year boundary', () => {
  const base = new Date(2026, 10, 30, 0, 0, 0);
  expect(stamp(withDatePart(base, new Date(2027, 0, 31)))).toBe('2027-1-31-0-0-0');
});

test('keeps the time-of-day of the base date', () => {
  const base = new Date(2026, 1, 28, 23, 59, 59);
  expect(stamp(withDatePart(base, new Date(2026, 11, 31)))).toBe('2026-12-31-23-59-59');
});

test('handles the last day of every month from any base date', () => {
  const base = new Date(2026, 8, 26, 9, 5, 0);
  const lastDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  lastDays.forEach((day, month) => {
    const picked = new Date(2026, month, day);
    expect(stamp(withDatePart(base, picked)), `last day of month ${month + 1}`).toBe(
      `2026-${month + 1}-${day}-9-5-0`,
    );
  });
});

test('does not mutate the base date', () => {
  const base = new Date(2026, 8, 26, 14, 30, 15);
  withDatePart(base, new Date(2026, 9, 31));
  expect(stamp(base)).toBe('2026-9-26-14-30-15');
});

test("a zoned date part replaces the day the user was shown, not the server's", () => {
  const base = new Date('2026-09-16T18:58:19.000Z');
  const unchanged = withZonedDatePart(base, new Date(2026, 8, 17), IST);
  expect(unchanged.toISOString()).toBe(base.toISOString());
});

test('a zoned date part moves the transaction by exactly the days asked for', () => {
  const base = new Date('2026-09-16T18:58:19.000Z');
  const moved = withZonedDatePart(base, new Date(2026, 8, 20), IST);
  expect(moved.toISOString()).toBe('2026-09-19T18:58:19.000Z');
});

test('a zoned date part keeps the overflow guard', () => {
  const base = new Date('2026-09-16T05:00:00.000Z');
  const moved = withZonedDatePart(base, new Date(2026, 9, 31), IST);
  expect(moved.toISOString()).toBe('2026-10-31T05:00:00.000Z');
});
