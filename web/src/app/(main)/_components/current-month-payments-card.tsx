'use client';

import { useMemo } from 'react';

import { endOfMonth, format } from 'date-fns';

import { DataTable } from '@/components/data-table/data-table';
import { useTimezone } from '@/components/time-zone-setter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import type { PaymentWithLocation } from '@/server/helpers/emi-calculations';
import {
  getCurrentMonthRecurringPayments,
  type RecurringPaymentSchedule,
} from '@/server/helpers/recurring-calculations';
import { type RouterOutput } from '@/server/routers';

type CreditCardData = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];

const isRecurring = (
  payment: RecurringPaymentSchedule | PaymentWithLocation,
): payment is RecurringPaymentSchedule => 'category' in payment;

export const CurrentMonthPaymentsCard = ({ creditData }: { creditData: CreditCardData }) => {
  const { currentMonthPayments, recurringPayments } = creditData;
  const timezone = useTimezone();
  const recurringCurrentMonth = useMemo(() => {
    const monthEnd = endOfMonth(new Date());
    return getCurrentMonthRecurringPayments(recurringPayments, monthEnd, timezone);
  }, [recurringPayments, timezone]);

  const currentMonthTotal = useMemo(() => {
    const emiTotal = currentMonthPayments.reduce((sum, p) => sum + p.amount, 0);
    const recurringTotal = recurringCurrentMonth.reduce((sum, p) => sum + p.amount, 0);
    return emiTotal + recurringTotal;
  }, [currentMonthPayments, recurringCurrentMonth]);

  const currentMonthMyTotal = useMemo(() => {
    const emiTotal = currentMonthPayments.reduce((sum, p) => sum + p.myShare, 0);
    const recurringTotal = recurringCurrentMonth.reduce((sum, p) => sum + p.amount, 0);
    return emiTotal + recurringTotal;
  }, [currentMonthPayments, recurringCurrentMonth]);

  const { table } = useDataTable({
    data: [...currentMonthPayments, ...recurringCurrentMonth],
    columns: [
      {
        id: 'type',
        header: 'Type',
        accessorFn: (row) => (isRecurring(row) ? 'Recurring' : 'EMI'),
      },
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row) => (isRecurring(row) ? row.name : row.emiName),
      },
      {
        id: 'category-card',
        header: 'Card/Category',
        accessorFn: (row) => (isRecurring(row) ? row.category : row.cardName),
      },
      {
        id: 'date',
        header: 'Date',
        accessorFn: (row) => format(row.date, 'MMM dd'),
      },
      {
        id: 'amount',
        header: 'Amount',
        accessorFn: (row) => formatCurrency(row.amount),
      },
      {
        id: 'my-payment',
        header: 'My Payment',
        accessorFn: (row) =>
          isRecurring(row) ? formatCurrency(row.amount) : formatCurrency(row.myShare),
      },
    ],
    pageCount: -1,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>This Month</CardTitle>
        <CardDescription>
          Upcoming payments • Total: {formatCurrency(currentMonthTotal)} • My Share:{' '}
          {formatCurrency(currentMonthMyTotal)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          background={false}
          enablePagination={false}
          getItemValue={(r) => r.date.toISOString()}
          showBorder={false}
          table={table}
        />
      </CardContent>
    </Card>
  );
};
