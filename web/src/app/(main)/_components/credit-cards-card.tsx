'use client';

import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { formatCurrency, formatOrdinalDay } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';
import { PERCENTAGE_DIVISOR } from '@/types';

type CreditCardData = RouterOutput['emis']['getCreditCardsWithOutstandingBalance'];
type SummaryData = RouterOutput['summary']['getAggregatedData'];

const UTILISATION_DECIMALS = 1;

export const CreditCardsCard = ({
  creditData,
  summaryData,
}: {
  creditData: CreditCardData;
  summaryData: SummaryData;
}) => {
  const { cards, cardDetails } = creditData;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit Cards</CardTitle>
        <CardDescription>Limit utilization and balances</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {cards.flatMap((card) => {
            const details = cardDetails[card.id] as
              | {
                  outstandingBalance: number;
                  currentStatement: number;
                }
              | undefined;
            if (details === undefined) {
              return [];
            }

            const accountSummary = summaryData.accountsSummary.find(
              (acc) => acc.account.id === card.accountId,
            );
            const currentBalance = accountSummary?.finalBalance ?? 0;

            const limitUtilized = Math.abs(currentBalance) + details.outstandingBalance;
            const totalLimit = parseFloat(card.cardLimit);
            const availableLimit = totalLimit - limitUtilized;

            return [
              <HoverCard key={card.id} closeDelay={100} openDelay={150}>
                <HoverCardTrigger asChild>
                  <Link
                    className="hover:bg-muted/50 focus-visible:ring-ring block rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    href={`/statements?account=${card.accountId}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">{card.accountName}</span>
                      <span className="text-muted-foreground text-sm">
                        {((limitUtilized / totalLimit) * PERCENTAGE_DIVISOR).toFixed(
                          UTILISATION_DECIMALS,
                        )}
                        % used
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
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Billing Date:</span>
                        <span className="font-medium">{formatOrdinalDay(card.billingDate)}</span>
                      </div>
                    </div>
                    <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full transition-all"
                        style={{
                          width: `${Math.min((limitUtilized / totalLimit) * PERCENTAGE_DIVISOR, PERCENTAGE_DIVISOR)}%`,
                        }}
                      />
                    </div>
                  </Link>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
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
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Billing Date:</span>
                        <span className="font-medium">{formatOrdinalDay(card.billingDate)}</span>
                      </div>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>,
            ];
          })}
        </div>
      </CardContent>
    </Card>
  );
};
