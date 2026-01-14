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
import { type RouterOutput } from '@/server/routers';

type CreditCardData = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];

export const FutureMonthsPaymentsCard = ({ creditData }: { creditData: CreditCardData }) => {
  const { paymentsByMonth } = creditData;

  const futureMonthsData = useMemo(() => {
    return Object.entries(paymentsByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, payments]) => ({
        month,
        total: payments.reduce((sum, p) => sum + p.amount, 0),
        payments,
      }));
  }, [paymentsByMonth]);

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
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {futureMonthsData.map(({ month, total }) => (
                <TableRow key={month}>
                  <TableCell className="font-medium">
                    {format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy')}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
