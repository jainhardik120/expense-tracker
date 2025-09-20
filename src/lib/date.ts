import { format } from 'date-fns';

import { DAYS, type DateTruncUnit } from '@/types';

const truncFormatMap: Record<DateTruncUnit, string> = {
  second: 'yyyy-MM-dd HH:mm:ss',
  minute: 'yyyy-MM-dd HH:mm',
  hour: 'yyyy-MM-dd HH:00',
  day: 'yyyy-MM-dd',
  week: "yyyy-'W'II",
  month: 'yyyy-MM',
  quarter: "yyyy-'Q'q",
  year: 'yyyy',
};

export const formatTruncatedDate = (date: Date | string, trunc: DateTruncUnit) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const formatStr = truncFormatMap[trunc];
  return format(d, formatStr);
};

export const convertEndDate = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() + DAYS);
  return d;
};
