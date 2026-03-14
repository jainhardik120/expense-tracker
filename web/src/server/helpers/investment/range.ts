import { investmentTimelineRangeDays, type InvestmentTimelineRangeValue } from '@/lib/investments';

import { DAY_IN_MS, startOfDay } from './shared';
import { dateToDayKey } from './utils';

export const clampDateInRange = (date: Date, rangeStart: Date, rangeEnd: Date): Date => {
  if (date.getTime() < rangeStart.getTime()) {
    return rangeStart;
  }
  if (date.getTime() > rangeEnd.getTime()) {
    return rangeEnd;
  }
  return date;
};

export const buildDailyRange = (startDate: Date, endDate: Date): Date[] => {
  const normalizedStart = startOfDay(startDate);
  const normalizedEnd = startOfDay(endDate);
  if (normalizedStart.getTime() > normalizedEnd.getTime()) {
    return [];
  }

  const days: Date[] = [];
  let cursor = normalizedStart;
  while (cursor.getTime() <= normalizedEnd.getTime()) {
    days.push(cursor);
    cursor = new Date(cursor.getTime() + DAY_IN_MS);
  }
  return days;
};

const subtractDays = (date: Date, days: number): Date => {
  return new Date(startOfDay(date).getTime() - Math.max(days - 1, 0) * DAY_IN_MS);
};

export const getTimeRangeBounds = (
  range: InvestmentTimelineRangeValue,
  earliestDate: Date,
  referenceEndDate?: Date,
): { startDate: Date; endDate: Date } => {
  const now = startOfDay(new Date());
  const requestedEnd = referenceEndDate === undefined ? now : startOfDay(referenceEndDate);
  const endDate = requestedEnd.getTime() > now.getTime() ? now : requestedEnd;
  const days = investmentTimelineRangeDays[range];
  if (days === undefined) {
    return {
      startDate: earliestDate,
      endDate,
    };
  }
  const requestedStart = subtractDays(endDate, days);
  return {
    startDate: requestedStart.getTime() < earliestDate.getTime() ? earliestDate : requestedStart,
    endDate,
  };
};

export const buildDailyPriceSeries = ({
  rawPoints,
  startDate,
  endDate,
  fallbackPrice,
}: {
  rawPoints: Array<{ date: Date; price: number }>;
  startDate: Date;
  endDate: Date;
  fallbackPrice?: number;
}): Array<{ date: Date; price: number }> => {
  const sorted = [...rawPoints].sort((left, right) => left.date.getTime() - right.date.getTime());
  const dayPriceMap = new Map<string, number>();
  for (const point of sorted) {
    dayPriceMap.set(dateToDayKey(point.date), point.price);
  }

  const days = buildDailyRange(startDate, endDate);
  let lastKnownPrice: number | undefined = fallbackPrice;
  return days.map((day) => {
    const key = dateToDayKey(day);
    const dayPrice = dayPriceMap.get(key);
    if (dayPrice !== undefined) {
      lastKnownPrice = dayPrice;
    }
    return {
      date: day,
      price: lastKnownPrice ?? 0,
    };
  });
};
