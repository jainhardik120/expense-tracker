'use client';

import { useMemo } from 'react';

import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
type SummaryData = RouterOutput['summary']['getSummary'];

export const EMISummaryCards = ({
  creditData,
  summaryData,
}: {
  creditData: CreditCardData;
  summaryData: SummaryData;
}) => {
  const { cards, cardDetails, currentMonthPayments, paymentsByMonth } = creditData;

  const futureMonthsData = useMemo(() => {
    return Object.entries(paymentsByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, payments]) => ({
        month,
        total: payments.reduce((sum, p) => sum + p.amount, 0),
        payments,
      }));
  }, [paymentsByMonth]);

  const currentMonthTotal = useMemo(() => {
    return currentMonthPayments.reduce((sum, p) => sum + p.amount, 0);
  }, [currentMonthPayments]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {/* Card 1: Credit Card Details */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Cards</CardTitle>
          <CardDescription>Limit utilization and balances</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {cards.map((card) => {
              const details = cardDetails[card.id] as
                | {
                    outstandingBalance: number;
                    currentStatement: number;
                  }
                | undefined;
              if (details === undefined) {
                return null;
              }

              const accountSummary = summaryData.accountsSummaryData.find(
                (acc) => acc.account.id === card.accountId,
              );
              const currentBalance = accountSummary?.finalBalance ?? 0;

              const limitUtilized = Math.abs(currentBalance) + details.outstandingBalance;
              const totalLimit = parseFloat(card.cardLimit);
              const availableLimit = totalLimit - limitUtilized;

              return (
                <Popover key={card.id}>
                  <PopoverTrigger asChild>
                    <div className="hover:bg-muted/50 cursor-pointer rounded-lg border p-3 transition-colors">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-medium">{card.accountName}</span>
                        <span className="text-muted-foreground text-sm">
                          {((limitUtilized / totalLimit) * 100).toFixed(1)}% used
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Utilized:</span>
                          <span className="font-medium">{formatCurrency(limitUtilized)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Available:</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(availableLimit)}
                          </span>
                        </div>
                      </div>
                      <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full transition-all"
                          style={{ width: `${Math.min((limitUtilized / totalLimit) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-2">
                      <h4 className="font-semibold">{card.accountName}</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Balance:</span>
                          <span className="font-medium">
                            {formatCurrency(Math.abs(currentBalance))}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">EMI Outstanding:</span>
                          <span className="font-medium">
                            {formatCurrency(details.outstandingBalance)}
                          </span>
                        </div>
                        <div className="border-t pt-1" />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Limit Utilized:</span>
                          <span className="font-medium">{formatCurrency(limitUtilized)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Limit:</span>
                          <span className="font-medium">{formatCurrency(totalLimit)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Available Limit:</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(availableLimit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Current Month Payments */}
      <Card>
        <CardHeader>
          <CardTitle>This Month</CardTitle>
          <CardDescription>
            Upcoming payments • Total: {formatCurrency(currentMonthTotal)}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentMonthPayments.map((payment) => (
                  <TableRow key={payment.emiId}>
                    <TableCell className="font-medium">{payment.emiName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {payment.cardName}
                    </TableCell>
                    <TableCell className="text-sm">{format(payment.date, 'MMM dd')}</TableCell>
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

      {/* Card 3: Future Months Payments */}
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
                      {format(new Date(`${month}-01`), 'MMMM yyyy')}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
