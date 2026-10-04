import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
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
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { getCookies } from 'next-client-cookies/server';

import { cachedDateFormat } from '@/lib/format';
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

export const localWallClock = (date: Date, timeZone: string): string => {
  const parts = cachedDateFormat('en-CA', {
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
  const hour = find('hour') === '24' ? '00' : find('hour');
  return `${find('year')}-${find('month')}-${find('day')}T${hour}:${find('minute')}`;
};

export const zonedFormat = (date: Date | string, pattern: string, timeZone: string): string => {
  const value = typeof date === 'string' ? new Date(date) : date;
  return format(toZonedTime(value, timeZone), pattern);
};

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

const ISO_DATE_LENGTH = 10;

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

export const periodStartsBetween = (
  start: Date,
  end: Date,
  trunc: DateTruncUnit,
  timeZone: string,
): Date[] => {
  const step: Record<DateTruncUnit, (date: Date, amount: number) => Date> = {
    day: addDays,
    week: addWeeks,
    month: addMonths,
    quarter: addQuarters,
    year: addYears,
  };
  const floor: Record<DateTruncUnit, (date: Date) => Date> = {
    day: startOfDay,
    week: startOfWeek,
    month: startOfMonth,
    quarter: startOfQuarter,
    year: startOfYear,
  };
  const starts: Date[] = [];
  let cursor = floor[trunc](toZonedTime(start, timeZone));
  const last = floor[trunc](toZonedTime(end, timeZone));
  const LIMIT = 400;
  while (cursor <= last && starts.length < LIMIT) {
    starts.push(fromZonedTime(cursor, timeZone));
    cursor = step[trunc](cursor, 1);
  }
  return starts;
};
