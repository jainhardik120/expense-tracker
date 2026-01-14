'use client';

import { useMemo } from 'react';

import { format } from 'date-fns';

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
import { type RouterOutput } from '@/server/routers';

type CreditCardData = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];

export const CurrentMonthPaymentsCard = ({ creditData }: { creditData: CreditCardData }) => {
  const { currentMonthPayments } = creditData;

  const currentMonthTotal = useMemo(() => {
    return currentMonthPayments.reduce((sum, p) => sum + p.amount, 0);
  }, [currentMonthPayments]);

  const currentMonthMyTotal = useMemo(() => {
    return currentMonthPayments.reduce((sum, p) => sum + p.myShare, 0);
  }, [currentMonthPayments]);

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
        {currentMonthPayments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No payments due this month</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>EMI</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">My Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentMonthPayments.map((payment) => (
                <TableRow key={`${payment.emiId}-${payment.date.toISOString()}`}>
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
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
