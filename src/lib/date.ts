import { format } from 'date-fns';
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

  return { start: startUtc, end: now, timezone };
};

export const getTimezone = async () => {
  const cookieStore = await getCookies();
  return cookieStore.get(TIMEZONE_COOKIE) ?? 'UTC';
};
