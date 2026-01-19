'use client';

import { useMemo } from 'react';

import { format, parse } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import { getFutureRecurringPayments } from '@/server/helpers/recurring-calculations';
import { type RouterOutput } from '@/server/routers';

type CreditCardData = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];

export const FutureMonthsPaymentsCard = ({ creditData }: { creditData: CreditCardData }) => {
  const { paymentsByMonth, recurringPayments, uptoDate } = creditData;

  const recurringPaymentsByMonth = useMemo(() => {
    if (!recurringPayments || !uptoDate) return {};
    return getFutureRecurringPayments(recurringPayments, uptoDate);
  }, [recurringPayments, uptoDate]);

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">EMI</TableHead>
                <TableHead className="text-right">Recurring</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">My Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {futureMonthsData.map(({ month, emiTotal, recurringTotal, total, myTotal }) => (
                <TableRow key={month}>
                  <TableCell className="font-medium">
                    {format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy')}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(emiTotal)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(recurringTotal)}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(total)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(myTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
