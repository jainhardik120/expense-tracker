'use client';

import { useMemo } from 'react';

import { endOfMonth, format, parse, startOfMonth } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { useQueryStates } from 'nuqs';

import { DataTable } from '@/components/data-table/data-table';
import { useTimezone } from '@/components/time-zone-setter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import { getFutureRecurringPayments } from '@/server/helpers/recurring-calculations';
import { type RouterOutput } from '@/server/routers';
import { dateParser } from '@/types';

type CreditCardData = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];

type FutureMonthData = {
  month: string;
  emiTotal: number;
  recurringTotal: number;
  total: number;
};

const MonthButton = ({ month, onSelect }: { month: string; onSelect: (month: string) => void }) => (
  <button
    className="underline-offset-4 hover:underline"
    type="button"
    onClick={() => {
      onSelect(month);
    }}
  >
    {format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy')}
  </button>
);

const createFutureMonthColumns = (onSelectMonth: (month: string) => void) => [
  {
    id: 'month',
    header: 'Month',
    cell: ({ row }: { row: { original: FutureMonthData } }) => (
      <MonthButton month={row.original.month} onSelect={onSelectMonth} />
    ),
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
];

export const FutureMonthsPaymentsCard = ({ creditData }: { creditData: CreditCardData }) => {
  const { paymentsByMonth, recurringPayments, recurringHorizon } = creditData;
  const timezone = useTimezone();
  const [, setDateRange] = useQueryStates(dateParser, { shallow: false });

  // Picking a month here drives the page's date filter, so the rest of the
  // dashboard -- the Payments card especially -- follows along to that month.
  const selectMonth = (month: string) => {
    const monthStart = parse(month, 'yyyy-MM', new Date());
    void setDateRange({
      start: fromZonedTime(startOfMonth(monthStart), timezone),
      end: fromZonedTime(endOfMonth(monthStart), timezone),
    });
  };
  const recurringPaymentsByMonth = useMemo(
    () => getFutureRecurringPayments(recurringPayments, recurringHorizon, timezone),
    [recurringPayments, recurringHorizon, timezone],
  );

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

        // myShare, not the full installment: a split EMI bills the friends' portions
        // to the card too, but only my share is money I actually owe.
        const emiTotal = emiPayments.reduce((sum, p) => sum + p.myShare, 0);
        const recurringTotal = recurringPaymentsList.reduce((sum, p) => sum + p.amount, 0);

        return {
          month,
          emiTotal,
          recurringTotal,
          total: emiTotal + recurringTotal,
        };
      });
  }, [paymentsByMonth, recurringPaymentsByMonth]);

  const { table } = useDataTable({
    data: futureMonthsData,
    columns: createFutureMonthColumns(selectMonth),
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
