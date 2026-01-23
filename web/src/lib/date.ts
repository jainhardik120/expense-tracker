import { format, startOfDay } from 'date-fns';
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
