'use client';

import { useMemo } from 'react';

import { format, parse } from 'date-fns';

import { DataTable } from '@/components/data-table/data-table';
import { useTimezone } from '@/components/time-zone-setter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import { getFutureRecurringPayments } from '@/server/helpers/recurring-calculations';
import { type RouterOutput } from '@/server/routers';

type CreditCardData = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];

type FutureMonthData = {
  month: string;
  emiTotal: number;
  emiMyTotal: number;
  recurringTotal: number;
  total: number;
  myTotal: number;
};

export const FutureMonthsPaymentsCard = ({ creditData }: { creditData: CreditCardData }) => {
  const { paymentsByMonth, recurringPayments, uptoDate } = creditData;
  const timezone = useTimezone();
  const recurringPaymentsByMonth = useMemo(() => {
    if (uptoDate === undefined) {
      return {};
    }
    return getFutureRecurringPayments(recurringPayments, uptoDate, timezone);
  }, [recurringPayments, uptoDate, timezone]);

  const futureMonthsData = useMemo(() => {
    const allMonths = new Set([
      ...Object.keys(paymentsByMonth),
      ...Object.keys(recurringPaymentsByMonth),
    ]);

    return Array.from(allMonths)
      .sort((a, b) => a.localeCompare(b))
      .map((month) => {
        const emiPayments = paymentsByMonth[month] ?? [];
        const recurringPaymentsList = recurringPaymentsByMonth[month] ?? [];

        const emiTotal = emiPayments.reduce((sum, p) => sum + p.amount, 0);
        const emiMyTotal = emiPayments.reduce((sum, p) => sum + p.myShare, 0);
        const recurringTotal = recurringPaymentsList.reduce((sum, p) => sum + p.amount, 0);

        return {
          month,
          emiTotal,
          emiMyTotal,
          recurringTotal,
          total: emiTotal + recurringTotal,
          myTotal: emiMyTotal + recurringTotal,
        };
      });
  }, [paymentsByMonth, recurringPaymentsByMonth]);

  const { table } = useDataTable({
    data: futureMonthsData,
    columns: [
      {
        id: 'month',
        header: 'Month',
        accessorFn: (row: FutureMonthData) =>
          format(parse(row.month, 'yyyy-MM', new Date()), 'MMMM yyyy'),
      },
      {
        id: 'emiTotal',
        header: 'EMI',
        accessorFn: (row: FutureMonthData) => formatCurrency(row.emiTotal),
      },
      {
        id: 'recurringTotal',
        header: 'Recurring',
        accessorFn: (row: FutureMonthData) => formatCurrency(row.recurringTotal),
      },
      {
        id: 'total',
        header: 'Total',
        accessorFn: (row: FutureMonthData) => formatCurrency(row.total),
      },
      {
        id: 'myTotal',
        header: 'My Payment',
        accessorFn: (row: FutureMonthData) => formatCurrency(row.myTotal),
      },
    ],
    pageCount: -1,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Future Months</CardTitle>
        <CardDescription>Upcoming payments by month</CardDescription>
      </CardHeader>
      <CardContent>
        {futureMonthsData.length === 0 ? (
          <p className="text-muted-foreground text-sm">No upcoming payments</p>
        ) : (
          <DataTable
            background={false}
            enablePagination={false}
            getItemValue={(r) => r.month}
            showBorder={false}
            table={table}
          />
        )}
      </CardContent>
    </Card>
  );
};
