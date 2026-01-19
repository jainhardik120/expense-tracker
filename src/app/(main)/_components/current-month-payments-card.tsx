'use client';

import { useMemo } from 'react';

import { endOfMonth, format } from 'date-fns';

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
import { getCurrentMonthRecurringPayments } from '@/server/helpers/recurring-calculations';
import { type RouterOutput } from '@/server/routers';

type CreditCardData = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];

export const CurrentMonthPaymentsCard = ({ creditData }: { creditData: CreditCardData }) => {
  const { currentMonthPayments, recurringPayments } = creditData;

  const recurringCurrentMonth = useMemo(() => {
    const monthEnd = endOfMonth(new Date());
    return getCurrentMonthRecurringPayments(recurringPayments ?? [], monthEnd);
  }, [recurringPayments]);

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

  const hasPayments = currentMonthPayments.length > 0 || recurringCurrentMonth.length > 0;

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
        {!hasPayments ? (
          <p className="text-muted-foreground text-sm">No payments due this month</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Card/Category</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">My Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentMonthPayments.map((payment) => (
                <TableRow key={`emi-${payment.emiId}-${payment.date.toISOString()}`}>
                  <TableCell className="font-medium">EMI</TableCell>
                  <TableCell className="font-medium">{payment.emiName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {payment.cardName}
                  </TableCell>
                  <TableCell className="text-sm">{format(payment.date, 'MMM dd')}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(payment.amount)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(payment.myShare)}
                  </TableCell>
                </TableRow>
              ))}
              {recurringCurrentMonth.map((payment) => (
                <TableRow key={`recurring-${payment.id}-${payment.date.toISOString()}`}>
                  <TableCell className="font-medium">Recurring</TableCell>
                  <TableCell className="font-medium">{payment.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {payment.category}
                  </TableCell>
                  <TableCell className="text-sm">{format(payment.date, 'MMM dd')}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(payment.amount)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(payment.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
