import { addDays, addMonths, addWeeks, addYears, format, isBefore, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import type { RecurringPayment, RecurringPaymentFrequency } from '@/types';

const QUARTERLY_MONTHS = 3;
const QUARTER_TOLERANCE = 0.25;

type RecurringPaymentSchedule = {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: Date;
};

/**
 * Check if a recurring payment is active based on endDate
 */
export const isRecurringPaymentActive = (recurringPayment: RecurringPayment): boolean => {
  if (recurringPayment.endDate === null) {
    return true;
  }
  const now = new Date();
  return isBefore(now, recurringPayment.endDate);
};

/**
 * Calculate the next payment date based on frequency and multiplier
 */
const getNextPaymentDate = (
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

/**
 * Get the period in days for a given frequency
 */
export const getPeriodInDays = (
  frequency: RecurringPaymentFrequency,
  multiplier: number,
): number => {
  switch (frequency) {
    case 'daily':
      return multiplier;
    case 'weekly':
      return 7 * multiplier;
    case 'monthly':
      return 30 * multiplier; // Approximate
    case 'quarterly':
      return 90 * multiplier; // Approximate
    case 'yearly':
      return 365 * multiplier; // Approximate
    default:
      return 30 * multiplier;
  }
};

/**
 * Check if a payment date is within tolerance of the expected date
 */
export const isPaymentWithinTolerance = (
  paymentDate: Date,
  expectedDate: Date,
  frequency: RecurringPaymentFrequency,
  multiplier: number,
): boolean => {
  const periodDays = getPeriodInDays(frequency, multiplier);
  const toleranceDays = periodDays * QUARTER_TOLERANCE;
  const diffMs = Math.abs(paymentDate.getTime() - expectedDate.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= toleranceDays;
};

/**
 * Generate all upcoming payment dates for a recurring payment up to a certain date
 */
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

  // Start from last payment date if provided, otherwise from start date
  const startDate = lastPaymentDate
    ? toZonedTime(lastPaymentDate, timezone)
    : toZonedTime(recurringPayment.startDate, timezone);

  const endDate =
    recurringPayment.endDate === null ? null : toZonedTime(recurringPayment.endDate, timezone);
  const uptoDateZoned = toZonedTime(uptoDate, timezone);

  let currentDate = lastPaymentDate
    ? getNextPaymentDate(startDate, recurringPayment.frequency, multiplier)
    : startDate;
  const now = startOfDay(toZonedTime(new Date(), timezone));

  // Only include future payments (not past payments)
  while (isBefore(currentDate, uptoDateZoned)) {
    // Check if payment is in the future
    if (!isBefore(currentDate, now)) {
      // Check if payment is before end date (if set)
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
        break; // Payment is after end date, stop
      }
    }

    currentDate = getNextPaymentDate(currentDate, recurringPayment.frequency, multiplier);
  }

  return payments;
};

/**
 * Group recurring payments by month (yyyy-MM format)
 */
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

/**
 * Get upcoming recurring payments for the current month
 */
export const getCurrentMonthRecurringPayments = (
  recurringPayments: RecurringPayment[],
  currentMonthEnd: Date,
  timezone: string,
): RecurringPaymentSchedule[] => {
  const currentMonthPayments: RecurringPaymentSchedule[] = [];

  for (const rp of recurringPayments) {
    const upcomingDates = getUpcomingPaymentDates(rp, currentMonthEnd, timezone);
    for (const payment of upcomingDates) {
      currentMonthPayments.push({
        id: rp.id,
        name: rp.name,
        category: rp.category,
        amount: payment.amount,
        date: payment.date,
      });
    }
  }

  return currentMonthPayments;
};

/**
 * Get future recurring payments grouped by month
 */
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
