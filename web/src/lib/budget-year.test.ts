import { describe, expect, test } from 'vitest';

import {
  budgetWindow,
  calendarDateForPicker,
  cycleStartDayOf,
  nextCycleStart,
  pickCurrentYear,
  spansOverlap,
  toCalendarDate,
  zonedCycleStart,
  zonedDaysBetween,
} from './budget-year';

const IST = 'Asia/Kolkata';
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const year2026 = { id: '2026', startDate: day('2025-12-23'), endDate: day('2026-12-22') };
const year2027 = { id: '2027', startDate: day('2026-12-23'), endDate: day('2027-12-22') };

describe('budget years are calendar dates', () => {
  test('a picked date keeps only its day in the user time zone, whatever the clock said', () => {
    expect(toCalendarDate(new Date('2026-12-22T20:02:19.244Z'), IST)).toEqual(day('2026-12-23'));
    expect(toCalendarDate(new Date('2026-12-23T00:00:00Z'), IST)).toEqual(day('2026-12-23'));
    expect(toCalendarDate(new Date('2026-12-22T18:29:59Z'), IST)).toEqual(day('2026-12-22'));
  });

  test('the window runs from local midnight on the first day to local midnight after the last', () => {
    expect(budgetWindow(year2026, IST)).toEqual({
      start: new Date('2025-12-22T18:30:00Z'),
      end: new Date('2026-12-22T18:30:00Z'),
    });
    expect(budgetWindow(year2026, 'UTC')).toEqual({
      start: day('2025-12-23'),
      end: day('2026-12-23'),
    });
  });

  test('consecutive years meet exactly, with no gap and no overlap', () => {
    expect(budgetWindow(year2026, IST).end).toEqual(budgetWindow(year2027, IST).start);
    expect(spansOverlap(year2026, year2027)).toBe(false);
    expect(
      spansOverlap(year2026, { startDate: day('2026-12-22'), endDate: day('2027-12-21') }),
    ).toBe(true);
  });

  test('the picker shows the stored day in any browser time zone', () => {
    const shown = calendarDateForPicker(day('2026-12-23'));
    expect([shown.getFullYear(), shown.getMonth(), shown.getDate()]).toEqual([2026, 11, 23]);
  });
});

describe('cycles follow the local calendar', () => {
  test('the cycle day is the first day of the year', () => {
    expect(cycleStartDayOf(year2026)).toBe(23);
  });

  test('a cycle opens at local midnight and the next one a month later', () => {
    const opened = zonedCycleStart('2026-10', 23, IST);
    expect(opened).toEqual(new Date('2026-10-22T18:30:00Z'));
    expect(nextCycleStart(opened, IST)).toEqual(new Date('2026-11-22T18:30:00Z'));
    expect(zonedDaysBetween(opened, nextCycleStart(opened, IST), IST)).toBe(31);
  });
});

describe('the current year is the one containing today', () => {
  const years = [year2027, year2026];

  test('a year created for next year does not take over before it starts', () => {
    expect(pickCurrentYear(years, new Date('2026-10-28T00:00:00Z'), IST)?.id).toBe('2026');
  });

  test('the new year takes over at local midnight on its first day', () => {
    expect(pickCurrentYear(years, new Date('2026-12-22T18:29:59Z'), IST)?.id).toBe('2026');
    expect(pickCurrentYear(years, new Date('2026-12-22T18:30:00Z'), IST)?.id).toBe('2027');
  });

  test('after the last year ends, or before the first starts, the nearest one is used', () => {
    expect(pickCurrentYear(years, new Date('2029-01-01T00:00:00Z'), IST)?.id).toBe('2027');
    expect(pickCurrentYear(years, new Date('2024-01-01T00:00:00Z'), IST)?.id).toBe('2026');
  });
});
