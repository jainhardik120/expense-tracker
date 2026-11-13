import { format } from 'date-fns';

import { DATE_FORMAT } from '@/lib/format';
import { type InterestPeriod } from '@/lib/interest';
import { type RouterOutput } from '@/server/routers';

export type InterestAccount = RouterOutput['accounts']['interest']['getOverview'][number];

export type InterestRow = InterestAccount['rows'][number];

export const toIsoDay = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

export const fromIsoDay = (day: string) => new Date(`${day}T00:00:00`);

export const showDay = (day: string) => format(fromIsoDay(day), DATE_FORMAT.date);

export const showPeriod = (period: InterestPeriod) =>
  `${format(fromIsoDay(period.start), DATE_FORMAT.day)} – ${showDay(period.end)}`;
