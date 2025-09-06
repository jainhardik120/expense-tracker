import { format } from 'date-fns';

import { type DateTruncUnit } from '@/types';

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
