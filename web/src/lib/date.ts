import {
  endOfDay,
  endOfHour,
  endOfMinute,
  endOfMonth,
  endOfQuarter,
  endOfSecond,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { getCookies } from 'next-client-cookies/server';

import { TIMEZONE_COOKIE, type DateTruncUnit } from '@/types';

const truncFormatMap: Record<DateTruncUnit, string> = {
  second: 'mm:ss',
  minute: 'HH:mm',
  hour: 'dd MMM HH:mm',
  day: 'MMM dd',
  week: "yyyy 'W'II",
  month: 'MMM yyyy',
  quarter: "yyyy 'Q'q",
  year: 'yyyy',
};

// Postgres `date_trunc('week', ...)` starts its weeks on Monday, so the
// matching end has to as well.
const truncEndMap: Record<DateTruncUnit, (date: Date) => Date> = {
  second: endOfSecond,
  minute: endOfMinute,
  hour: endOfHour,
  day: endOfDay,
  week: (date) => endOfWeek(date, { weekStartsOn: 1 }),
  month: endOfMonth,
  quarter: endOfQuarter,
  year: endOfYear,
};

export const formatTruncatedDate = (
  date: Date | string,
  trunc: DateTruncUnit,
  timezone: string,
) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const zonedDate = toZonedTime(d, timezone);
  const formatStr = truncFormatMap[trunc];
  return format(zonedDate, formatStr);
};

/**
 * An instant written as the reader's wall clock: `YYYY-MM-DDTHH:mm`.
 *
 * Stored timestamps are instants, and the calendar day an instant falls on
 * depends on who is looking. A purchase at 00:30 on 1 January in Delhi is
 * 19:00 on 31 December in UTC, so anything that slices a day out of
 * `toISOString()` reports the wrong date for half the night, every night.
 *
 * The result deliberately carries no zone suffix: it is a wall clock, not an
 * instant, and is meant for display and for grouping by day. Sorting still
 * works, because the format is lexicographic. Anything that needs the instant
 * back should be handed the instant instead.
 */
export const localWallClock = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  // en-CA renders midnight as 24 rather than 00 in some runtimes.
  const hour = find('hour') === '24' ? '00' : find('hour');
  return `${find('year')}-${find('month')}-${find('day')}T${hour}:${find('minute')}`;
};

/** date-fns formatting, in the reader's timezone rather than the server's. */
export const zonedFormat = (date: Date | string, pattern: string, timeZone: string): string => {
  const value = typeof date === 'string' ? new Date(date) : date;
  return format(toZonedTime(value, timeZone), pattern);
};

/**
 * The calendar days a bucket actually covers, clipped to the range that was
 * asked for. A label like `2026 W39` says nothing about where the week fell,
 * and the first and last buckets of a range are usually partial ones, so the
 * clipped span is what a reader needs to make sense of the number.
 */
export const formatTruncatedPeriodSpan = (
  date: Date | string,
  trunc: DateTruncUnit,
  timezone: string,
  range: { start: Date; end: Date },
): string => {
  const periodStart = typeof date === 'string' ? new Date(date) : date;
  const zonedStart = toZonedTime(periodStart, timezone);
  const start = new Date(
    Math.max(fromZonedTime(zonedStart, timezone).getTime(), range.start.getTime()),
  );
  const end = new Date(
    Math.min(
      fromZonedTime(truncEndMap[trunc](zonedStart), timezone).getTime(),
      range.end.getTime(),
    ),
  );
  const startText = zonedFormat(start, 'dd MMM yyyy', timezone);
  const endText = zonedFormat(end, 'dd MMM yyyy', timezone);
  if (startText === endText) {
    return endText;
  }
  const YEAR_LENGTH = 5;
  const sameYear = startText.slice(-YEAR_LENGTH) === endText.slice(-YEAR_LENGTH);
  return `${sameYear ? startText.slice(0, -YEAR_LENGTH) : startText} – ${endText}`;
};

/** Length of a `YYYY-MM-DD` date, as it appears at the head of an ISO timestamp. */
const ISO_DATE_LENGTH = 10;

/** Just the reader's calendar day, `YYYY-MM-DD`. */
export const localDay = (date: Date, timeZone: string): string =>
  localWallClock(date, timeZone).slice(0, ISO_DATE_LENGTH);

export const getDefaultDateRange = (timezone: string) => {
  const now = new Date();
  const localNow = toZonedTime(now, timezone);
  const startOfMonthLocal = new Date(localNow.getFullYear(), localNow.getMonth(), 1, 0, 0, 0, 0);
  const startUtc = fromZonedTime(startOfMonthLocal, timezone);
  const DECEMBER = 11;
  const LAST_DAY = 31;
  const LAST_HOUR = 23;
  const LAST_MINUTE = 59;
  const LAST_SECOND = 59;
  const endOfYearLocal = new Date(
    localNow.getFullYear(),
    DECEMBER,
    LAST_DAY,
    LAST_HOUR,
    LAST_MINUTE,
    LAST_SECOND,
  );
  const endOfYear = fromZonedTime(endOfYearLocal, timezone);
  return { start: startUtc, end: now, timezone, endOfYear };
};

export const getTimezone = async () => {
  const cookieStore = await getCookies();
  return cookieStore.get(TIMEZONE_COOKIE) ?? 'UTC';
};

export const startOfDayLocal = (date: Date, timeZone: string = 'UTC') => {
  const zoned = toZonedTime(date, timeZone);
  const start = startOfDay(zoned);
  return fromZonedTime(start, timeZone);
};

export const startOfMonthLocal = (date: Date, timeZone: string = 'UTC') => {
  const zoned = toZonedTime(date, timeZone);
  return fromZonedTime(startOfMonth(zoned), timeZone);
};

export const endOfMonthLocal = (date: Date, timeZone: string = 'UTC') => {
  const zoned = toZonedTime(date, timeZone);
  return fromZonedTime(endOfMonth(zoned), timeZone);
};
