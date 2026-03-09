'use client';

import { useMemo, useState } from 'react';

import { addDays, endOfDay, format, getDaysInMonth, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import { useTimezone } from '@/components/time-zone-setter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/format';
import {
  getFutureRecurringPayments,
  type RecurringPaymentSchedule,
} from '@/server/helpers/recurring-calculations';
import { type RouterOutput } from '@/server/routers';

type CreditCardData = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];
type SummaryData = RouterOutput['summary']['getAggregatedData'];

type UpcomingPayment = {
  id: string;
  type: 'EMI' | 'Recurring' | 'Credit Card Bill';
  name: string;
  date: Date;
  amount: number;
};

const DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

const getBillingDateInMonth = (year: number, month: number, billingDate: number) => {
  const dayInMonth = Math.min(billingDate, getDaysInMonth(new Date(year, month, 1)));
  return new Date(year, month, dayInMonth);
};

const getNextBillingDate = (billingDate: number, now: Date) => {
  const currentMonthDate = getBillingDateInMonth(now.getFullYear(), now.getMonth(), billingDate);
  if (currentMonthDate >= now) {
    return currentMonthDate;
  }
  return getBillingDateInMonth(now.getFullYear(), now.getMonth() + 1, billingDate);
};

const isWithinRange = (date: Date, start: Date, end: Date) => date >= start && date <= end;

export const DashboardPaymentOverview = ({
  creditData,
  summaryData,
}: {
  creditData: CreditCardData;
  summaryData: SummaryData;
}) => {
  const timezone = useTimezone();
  const [days, setDays] = useState<number>(7);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = toZonedTime(new Date(), timezone);
    const start = startOfDay(now);
    const end = endOfDay(addDays(start, days - 1));
    return {
      rangeStart: start,
      rangeEnd: end,
    };
  }, [days, timezone]);

  const emiPayments = useMemo(() => {
    const futureEmiPayments = Object.values(creditData.paymentsByMonth).flat();
    const allEmiPayments = [...creditData.currentMonthPayments, ...futureEmiPayments];
    return allEmiPayments.filter((payment) => isWithinRange(payment.date, rangeStart, rangeEnd));
  }, [creditData.currentMonthPayments, creditData.paymentsByMonth, rangeEnd, rangeStart]);

  const recurringPayments = useMemo(() => {
    const recurringByMonth = getFutureRecurringPayments(
      creditData.recurringPayments,
      addDays(rangeEnd, 1),
      timezone,
    );
    const allRecurringPayments = Object.values(recurringByMonth).flat();
    return allRecurringPayments.filter((payment) =>
      isWithinRange(payment.date, rangeStart, rangeEnd),
    );
  }, [creditData.recurringPayments, rangeEnd, rangeStart, timezone]);

  const creditCardBillPayments = useMemo(() => {
    return creditData.cards.flatMap((card) => {
      const dueDate = getNextBillingDate(card.billingDate, rangeStart);
      if (!isWithinRange(dueDate, rangeStart, rangeEnd)) {
        return [];
      }
      const accountSummary = summaryData.accountsSummary.find(
        (summary) => summary.account.id === card.accountId,
      );
      const currentUtilization = Math.max(-(accountSummary?.finalBalance ?? 0), 0);
      const upcomingEmiForCard = emiPayments
        .filter((payment) => payment.cardName === card.accountName)
        .reduce((sum, payment) => sum + payment.myShare, 0);
      const amount = currentUtilization + upcomingEmiForCard;
      if (amount <= 0) {
        return [];
      }
      return [
        {
          id: card.id,
          type: 'Credit Card Bill' as const,
          name: card.accountName,
          date: dueDate,
          amount,
        },
      ];
    });
  }, [creditData.cards, emiPayments, rangeEnd, rangeStart, summaryData.accountsSummary]);

  const totals = useMemo(() => {
    const emiTotal = emiPayments.reduce((sum, payment) => sum + payment.myShare, 0);
    const recurringTotal = recurringPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const creditCardTotal = creditCardBillPayments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    const totalPaymentNeeded = creditCardTotal + recurringTotal;

    const creditCardAccountIds = new Set(creditData.cards.map((card) => card.accountId));
    const availableNonCreditBalance = summaryData.accountsSummary
      .filter((summary) => !creditCardAccountIds.has(summary.account.id))
      .reduce((sum, summary) => sum + Math.max(summary.finalBalance, 0), 0);

    return {
      emiTotal,
      recurringTotal,
      creditCardTotal,
      totalPaymentNeeded,
      availableNonCreditBalance,
      shortfall: totalPaymentNeeded - availableNonCreditBalance,
    };
  }, [creditCardBillPayments, creditData.cards, emiPayments, recurringPayments, summaryData]);

  const upcomingPayments = useMemo(() => {
    const emiItems: UpcomingPayment[] = emiPayments.map((payment) => ({
      id: `${payment.emiId}-${payment.date.toISOString()}`,
      type: 'EMI',
      name: `${payment.emiName} (${payment.cardName})`,
      date: payment.date,
      amount: payment.myShare,
    }));
    const recurringItems: UpcomingPayment[] = recurringPayments.map(
      (payment: RecurringPaymentSchedule) => ({
        id: `${payment.id}-${payment.date.toISOString()}`,
        type: 'Recurring',
        name: payment.name,
        date: payment.date,
        amount: payment.amount,
      }),
    );

    return [...emiItems, ...recurringItems, ...creditCardBillPayments].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [creditCardBillPayments, emiPayments, recurringPayments]);

  const BALANCE_BUFFER_RATIO = 1.2;

  const warning = useMemo(() => {
    if (totals.shortfall > 0) {
      return {
        label: 'Low balance warning',
        message: `You are short by ${formatCurrency(totals.shortfall)} for the selected period.`,
        className: 'text-red-600',
      };
    }

    const isTightBalance =
      totals.availableNonCreditBalance < totals.totalPaymentNeeded * BALANCE_BUFFER_RATIO;

    if (isTightBalance) {
      return {
        label: 'Low balance warning',
        message: 'Available balance is tight for upcoming payments.',
        className: 'text-amber-600',
      };
    }

    return {
      label: 'Balance status',
      message: 'Available balance is healthy for upcoming payments.',
      className: 'text-green-600',
    };
  }, [totals]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Payment Overview</CardTitle>
            <CardDescription>Upcoming commitments and available cash position</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Window</span>
            <Select
              value={String(days)}
              onValueChange={(value) => {
                setDays(parseInt(value, 10));
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OPTIONS.map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {day} day{day === 1 ? '' : 's'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Credit Card Bills</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.creditCardTotal)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Recurring</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.recurringTotal)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">EMI (in window)</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.emiTotal)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Total Payment Needed</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.totalPaymentNeeded)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Available Non-Credit Balance</p>
            <p className="text-lg font-semibold">
              {formatCurrency(totals.availableNonCreditBalance)}
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">{warning.label}</p>
          <p className={`text-sm ${warning.className}`}>{warning.message}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            Upcoming Payments ({format(rangeStart, 'MMM dd')} - {format(rangeEnd, 'MMM dd')})
          </p>
          {upcomingPayments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No upcoming payments in this window.</p>
          ) : (
            <div className="space-y-2">
              {upcomingPayments.map((payment) => (
                <div
                  key={`${payment.type}-${payment.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"
                >
                  <div>
                    <p className="text-sm font-medium">{payment.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {payment.type} • {format(payment.date, 'MMM dd')}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{formatCurrency(payment.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
