import { addDays, addMonths, differenceInCalendarDays, format } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

type CalendarSpan = { startDate: Date; endDate: Date };

const ISO_DAY = 'yyyy-MM-dd';

const calendarKey = (date: Date) =>
  `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;

const midnightIn = (day: string, timeZone: string) => fromZonedTime(`${day}T00:00:00`, timeZone);

export const toCalendarDate = (date: Date, timeZone: string): Date => {
  const zoned = toZonedTime(date, timeZone);
  return new Date(Date.UTC(zoned.getFullYear(), zoned.getMonth(), zoned.getDate()));
};

export const calendarDateForPicker = (date: Date): Date =>
  new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export const budgetWindow = (year: CalendarSpan, timeZone: string) => ({
  start: midnightIn(calendarKey(year.startDate), timeZone),
  end: midnightIn(calendarKey(addDays(year.endDate, 1)), timeZone),
});

export const cycleStartDayOf = (year: CalendarSpan): number => year.startDate.getUTCDate();

export const zonedCycleStart = (cycleKey: string, startDay: number, timeZone: string): Date =>
  midnightIn(`${cycleKey}-${String(startDay).padStart(2, '0')}`, timeZone);

export const nextCycleStart = (cycleStart: Date, timeZone: string): Date =>
  midnightIn(format(addMonths(toZonedTime(cycleStart, timeZone), 1), ISO_DAY), timeZone);

export const zonedDaysBetween = (from: Date, to: Date, timeZone: string): number =>
  differenceInCalendarDays(toZonedTime(to, timeZone), toZonedTime(from, timeZone));

export const pickCurrentYear = <T extends CalendarSpan>(
  years: T[],
  now: Date,
  timeZone: string,
): T | undefined => {
  const ordered = years.toSorted(
    (left, right) => left.startDate.getTime() - right.startDate.getTime(),
  );
  const containing = ordered.find((year) => {
    const window = budgetWindow(year, timeZone);
    return window.start <= now && now < window.end;
  });
  return (
    containing ??
    ordered.findLast((year) => budgetWindow(year, timeZone).start <= now) ??
    ordered.at(0)
  );
};

export const spansOverlap = (left: CalendarSpan, right: CalendarSpan): boolean =>
  left.startDate <= right.endDate && right.startDate <= left.endDate;
