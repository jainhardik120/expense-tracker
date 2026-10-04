import { addDays, addMonths, addWeeks, addYears, format, isBefore, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import {
  MS_PER_DAY,
  type RecurringPayment,
  type RecurringPaymentFrequency,
  type PaymentStatus,
} from '@/types';

const QUARTERLY_MONTHS = 3;
const QUARTER_TOLERANCE = 0.25;

const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_QUARTER = 90;
const DAYS_PER_YEAR = 365;

export type RecurringPaymentSchedule = {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: Date;
};

export const isRecurringPaymentActive = (recurringPayment: RecurringPayment): boolean => {
  if (recurringPayment.endDate === null) {
    return true;
  }
  const now = new Date();
  return isBefore(now, recurringPayment.endDate);
};

export const getNextPaymentDate = (
  currentDate: Date,
  frequency: RecurringPaymentFrequency,
  multiplier: number,
): Date => {
  switch (frequency) {
    case 'daily':
      return addDays(currentDate, multiplier);
    case 'weekly':
      return addWeeks(currentDate, multiplier);
    case 'monthly':
      return addMonths(currentDate, multiplier);
    case 'quarterly':
      return addMonths(currentDate, QUARTERLY_MONTHS * multiplier);
    case 'yearly':
      return addYears(currentDate, multiplier);
    default:
      return currentDate;
  }
};

export const getPeriodInDays = (
  frequency: RecurringPaymentFrequency,
  multiplier: number,
): number => {
  switch (frequency) {
    case 'daily':
      return multiplier;
    case 'weekly':
      return DAYS_PER_WEEK * multiplier;
    case 'monthly':
      return DAYS_PER_MONTH * multiplier;
    case 'quarterly':
      return DAYS_PER_QUARTER * multiplier;
    case 'yearly':
      return DAYS_PER_YEAR * multiplier;
    default:
      return DAYS_PER_MONTH * multiplier;
  }
};

export const isPaymentWithinTolerance = (
  paymentDate: Date,
  expectedDate: Date,
  frequency: RecurringPaymentFrequency,
  multiplier: number,
): boolean => {
  const periodDays = getPeriodInDays(frequency, multiplier);
  const toleranceDays = periodDays * QUARTER_TOLERANCE;
  const diffMs = Math.abs(paymentDate.getTime() - expectedDate.getTime());
  const diffDays = diffMs / MS_PER_DAY;
  return diffDays <= toleranceDays;
};

const getUpcomingPaymentDates = (
  recurringPayment: RecurringPayment,
  uptoDate: Date,
  timezone: string,
  lastPaymentDate?: Date | null,
): { date: Date; amount: number }[] => {
  if (!isRecurringPaymentActive(recurringPayment)) {
    return [];
  }

  const payments: { date: Date; amount: number }[] = [];
  const multiplier = parseFloat(recurringPayment.frequencyMultiplier);

  const hasLastPayment = lastPaymentDate !== undefined && lastPaymentDate !== null;
  const startDate = hasLastPayment
    ? toZonedTime(lastPaymentDate, timezone)
    : toZonedTime(recurringPayment.startDate, timezone);

  const endDate =
    recurringPayment.endDate === null ? null : toZonedTime(recurringPayment.endDate, timezone);
  const uptoDateZoned = toZonedTime(uptoDate, timezone);

  let currentDate = hasLastPayment
    ? getNextPaymentDate(startDate, recurringPayment.frequency, multiplier)
    : startDate;
  const now = startOfDay(toZonedTime(new Date(), timezone));

  while (isBefore(currentDate, uptoDateZoned)) {
    if (!isBefore(currentDate, now)) {
      if (
        endDate === null ||
        isBefore(currentDate, endDate) ||
        currentDate.getTime() === endDate.getTime()
      ) {
        payments.push({
          date: currentDate,
          amount: parseFloat(recurringPayment.amount),
        });
      } else {
        break;
      }
    }

    currentDate = getNextPaymentDate(currentDate, recurringPayment.frequency, multiplier);
  }

  return payments;
};

const groupRecurringPaymentsByMonth = (
  payments: RecurringPaymentSchedule[],
): Record<string, RecurringPaymentSchedule[]> => {
  const grouped: Record<string, RecurringPaymentSchedule[]> = {};

  for (const payment of payments) {
    const monthKey = format(payment.date, 'yyyy-MM');
    if (!(monthKey in grouped)) {
      grouped[monthKey] = [];
    }
    grouped[monthKey].push(payment);
  }

  return grouped;
};

export const getFutureRecurringPayments = (
  recurringPayments: RecurringPayment[],
  uptoDate: Date,
  timezone: string,
): Record<string, RecurringPaymentSchedule[]> => {
  const allPayments: RecurringPaymentSchedule[] = [];

  for (const rp of recurringPayments) {
    const upcomingDates = getUpcomingPaymentDates(rp, uptoDate, timezone);
    for (const payment of upcomingDates) {
      allPayments.push({
        id: rp.id,
        name: rp.name,
        category: rp.category,
        amount: payment.amount,
        date: payment.date,
      });
    }
  }

  return groupRecurringPaymentsByMonth(allPayments);
};

type LinkedStatement = {
  id: string;
  amount: string;
  createdAt: Date;
};

type LinkedStatementWithZonedDate = LinkedStatement & {
  zonedDate: Date;
};

export type PaymentScheduleEntry = {
  scheduledDate: Date;
  expectedAmount: number;
  status: PaymentStatus;
  linkedStatementId: string | null;
  linkedStatementDate: Date | null;
  linkedStatementAmount: number | null;
};

export const generatePaymentSchedule = (
  recurringPayment: RecurringPayment,
  linkedStatements: LinkedStatement[],
  timezone: string,
  endOfYear: Date,
): {
  schedule: PaymentScheduleEntry[];
  nextPaymentDate: Date | null;
} => {
  const schedule: PaymentScheduleEntry[] = [];
  const multiplier = parseFloat(recurringPayment.frequencyMultiplier);
  const expectedAmount = parseFloat(recurringPayment.amount);

  const startDate = toZonedTime(recurringPayment.startDate, timezone);
  const endDate =
    recurringPayment.endDate === null ? null : toZonedTime(recurringPayment.endDate, timezone);
  const endOfYearZoned = toZonedTime(endOfYear, timezone);
  const now = startOfDay(toZonedTime(new Date(), timezone));

  const sortedStatements: LinkedStatementWithZonedDate[] = linkedStatements
    .map((stmt) => ({
      ...stmt,
      zonedDate: toZonedTime(new Date(stmt.createdAt), timezone),
    }))
    .sort((a, b) => a.zonedDate.getTime() - b.zonedDate.getTime());

  const usedStatementIds = new Set<string>();

  let currentDate = startDate;

  while (
    isBefore(currentDate, endOfYearZoned) ||
    currentDate.getTime() === endOfYearZoned.getTime()
  ) {
    if (
      endDate !== null &&
      !isBefore(currentDate, endDate) &&
      currentDate.getTime() !== endDate.getTime()
    ) {
      break;
    }

    let matchedStatement: LinkedStatementWithZonedDate | null = null;
    for (const stmt of sortedStatements) {
      if (usedStatementIds.has(stmt.id)) {
        continue;
      }

      if (
        isPaymentWithinTolerance(
          stmt.zonedDate,
          currentDate,
          recurringPayment.frequency,
          multiplier,
        )
      ) {
        matchedStatement = stmt;
        usedStatementIds.add(stmt.id);
        break;
      }
    }

    let status: PaymentStatus;
    if (matchedStatement !== null) {
      status = 'paid';
    } else if (isBefore(currentDate, now)) {
      status = 'missed';
    } else {
      status = 'upcoming';
    }

    schedule.push({
      scheduledDate: currentDate,
      expectedAmount,
      status,
      linkedStatementId: matchedStatement?.id ?? null,
      linkedStatementDate: matchedStatement?.zonedDate ?? null,
      linkedStatementAmount: matchedStatement !== null ? parseFloat(matchedStatement.amount) : null,
    });

    currentDate = getNextPaymentDate(currentDate, recurringPayment.frequency, multiplier);
  }

  let nextPaymentDate: Date | null = null;
  for (const entry of schedule) {
    if (entry.status === 'upcoming') {
      nextPaymentDate = entry.scheduledDate;
      break;
    }
  }

  if (nextPaymentDate === null && isRecurringPaymentActive(recurringPayment)) {
    const lastScheduledDate =
      schedule.length > 0 ? schedule[schedule.length - 1].scheduledDate : startDate;
    const nextDate = getNextPaymentDate(lastScheduledDate, recurringPayment.frequency, multiplier);
    if (!isBefore(nextDate, now)) {
      nextPaymentDate = nextDate;
    }
  }

  return { schedule, nextPaymentDate };
};

export type ScheduledRecurringPayment = {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: Date;
  status: 'paid' | 'missed' | 'upcoming';
};

export const getRecurringPaymentsInRange = (
  recurringPayment: RecurringPayment,
  linkedStatements: LinkedStatement[],
  timezone: string,
  rangeStart: Date,
  rangeEnd: Date,
): ScheduledRecurringPayment[] => {
  const { schedule } = generatePaymentSchedule(
    recurringPayment,
    linkedStatements,
    timezone,
    rangeEnd,
  );

  return schedule.flatMap((entry) => {
    const date = fromZonedTime(entry.scheduledDate, timezone);
    if (date < rangeStart || date > rangeEnd) {
      return [];
    }
    return [
      {
        id: recurringPayment.id,
        name: recurringPayment.name,
        category: recurringPayment.category,
        amount: entry.expectedAmount,
        date,
        status: entry.status,
      },
    ];
  });
};

const MAX_SCHEDULE_ITERATIONS = 10000;

export const findScheduledOccurrence = (
  recurringPayment: RecurringPayment,
  statementDate: Date,
  timezone: string,
): Date | null => {
  const multiplier = parseFloat(recurringPayment.frequencyMultiplier);
  const startDate = startOfDay(toZonedTime(recurringPayment.startDate, timezone));
  const endDate =
    recurringPayment.endDate === null
      ? null
      : startOfDay(toZonedTime(recurringPayment.endDate, timezone));
  const target = startOfDay(toZonedTime(statementDate, timezone));

  let currentDate = startDate;
  let closest: Date | null = null;
  let closestDiff = Number.POSITIVE_INFINITY;

  for (let iteration = 0; iteration < MAX_SCHEDULE_ITERATIONS; iteration++) {
    if (endDate !== null && isBefore(endDate, currentDate)) {
      break;
    }
    const diff = Math.abs(currentDate.getTime() - target.getTime());
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = currentDate;
    }
    if (isBefore(target, currentDate)) {
      break;
    }
    const nextDate = getNextPaymentDate(currentDate, recurringPayment.frequency, multiplier);
    if (nextDate.getTime() <= currentDate.getTime()) {
      break;
    }
    currentDate = nextDate;
  }

  if (
    closest === null ||
    !isPaymentWithinTolerance(target, closest, recurringPayment.frequency, multiplier)
  ) {
    return null;
  }
  return closest;
};

export const isOccurrenceSettled = (
  recurringPayment: RecurringPayment,
  occurrence: Date,
  linkedStatements: LinkedStatement[],
  timezone: string,
): boolean => {
  const multiplier = parseFloat(recurringPayment.frequencyMultiplier);
  return linkedStatements.some((stmt) =>
    isPaymentWithinTolerance(
      startOfDay(toZonedTime(new Date(stmt.createdAt), timezone)),
      startOfDay(occurrence),
      recurringPayment.frequency,
      multiplier,
    ),
  );
};
