import { addDays, addMonths, addWeeks, addYears, format, isBefore, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import type { RecurringPayment, RecurringPaymentFrequency } from '@/types';

const QUARTERLY_MONTHS = 3;

type RecurringPaymentSchedule = {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: Date;
};

/**
 * Calculate the next payment date based on frequency
 */
const getNextPaymentDate = (currentDate: Date, frequency: RecurringPaymentFrequency): Date => {
  switch (frequency) {
    case 'daily':
      return addDays(currentDate, 1);
    case 'weekly':
      return addWeeks(currentDate, 1);
    case 'monthly':
      return addMonths(currentDate, 1);
    case 'quarterly':
      return addMonths(currentDate, QUARTERLY_MONTHS);
    case 'yearly':
      return addYears(currentDate, 1);
    default:
      return currentDate;
  }
};

/**
 * Generate all upcoming payment dates for a recurring payment up to a certain date
 */
const getUpcomingPaymentDates = (
  recurringPayment: RecurringPayment,
  uptoDate: Date,
  timezone: string,
): { date: Date; amount: number }[] => {
  if (!recurringPayment.isActive) {
    return [];
  }

  const payments: { date: Date; amount: number }[] = [];
  const startDate = toZonedTime(recurringPayment.startDate, timezone);
  const endDate =
    recurringPayment.endDate === null ? null : toZonedTime(recurringPayment.endDate, timezone);
  const uptoDateZoned = toZonedTime(uptoDate, timezone);

  let currentDate = startDate;
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

    currentDate = getNextPaymentDate(currentDate, recurringPayment.frequency);
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
