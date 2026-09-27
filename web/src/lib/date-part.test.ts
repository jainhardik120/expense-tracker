/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises, no-magic-numbers */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  withDatePart,
  withZonedDatePart,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './date-part.ts';

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
  // Creating a statement on 26 Sep and picking 31 Oct used to land on 1 Oct,
  // because setting the day before the month overflowed 30-day September.
  const base = new Date(2026, 8, 26, 14, 30, 15);
  assert.equal(stamp(withDatePart(base, new Date(2026, 9, 31))), '2026-10-31-14-30-15');
  assert.equal(stamp(withDatePart(base, new Date(2026, 7, 31))), '2026-8-31-14-30-15');
});

test('carries the picked day across a year boundary', () => {
  const base = new Date(2026, 10, 30, 0, 0, 0);
  assert.equal(stamp(withDatePart(base, new Date(2027, 0, 31))), '2027-1-31-0-0-0');
});

test('keeps the time-of-day of the base date', () => {
  const base = new Date(2026, 1, 28, 23, 59, 59);
  assert.equal(stamp(withDatePart(base, new Date(2026, 11, 31))), '2026-12-31-23-59-59');
});

test('handles the last day of every month from any base date', () => {
  const base = new Date(2026, 8, 26, 9, 5, 0);
  const lastDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  lastDays.forEach((day, month) => {
    const picked = new Date(2026, month, day);
    assert.equal(
      stamp(withDatePart(base, picked)),
      `2026-${month + 1}-${day}-9-5-0`,
      `last day of month ${month + 1}`,
    );
  });
});

test('does not mutate the base date', () => {
  const base = new Date(2026, 8, 26, 14, 30, 15);
  withDatePart(base, new Date(2026, 9, 31));
  assert.equal(stamp(base), '2026-9-26-14-30-15');
});

test('a zoned date part replaces the day the user was shown, not the server\'s', () => {
  // 18:58 UTC on 16 Sep is 00:28 on 17 Sep in IST. Leaving the grid's date
  // alone has to leave the instant alone.
  const base = new Date('2026-09-16T18:58:19.000Z');
  const unchanged = withZonedDatePart(base, new Date(2026, 8, 17), IST);
  assert.equal(unchanged.toISOString(), base.toISOString());
});

test('a zoned date part moves the transaction by exactly the days asked for', () => {
  const base = new Date('2026-09-16T18:58:19.000Z'); // 17 Sep 00:28 IST
  const moved = withZonedDatePart(base, new Date(2026, 8, 20), IST);
  // Still 00:28 IST, now on the 20th.
  assert.equal(moved.toISOString(), '2026-09-19T18:58:19.000Z');
});

test('a zoned date part keeps the overflow guard', () => {
  const base = new Date('2026-09-16T05:00:00.000Z'); // 10:30 IST
  const moved = withZonedDatePart(base, new Date(2026, 9, 31), IST);
  assert.equal(moved.toISOString(), '2026-10-31T05:00:00.000Z');
});
