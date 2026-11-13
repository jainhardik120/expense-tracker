'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { formatCurrency, formatPercent } from '@/lib/format';
import { estimateFundsToday } from '@/lib/fund-estimate';
import { cn } from '@/lib/utils';
import { isIndianMarketOpen } from '@/server/helpers/investment/market-hours';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { MS_PER_MINUTE } from '@/types';

import { getSignedValueTone } from './investment-columns';

type DashboardData = RouterOutput['investments']['getInvestmentsInitialData']['dashboard'];

const MUTUAL_FUNDS = 'mutual_funds';
const DAY_FORMAT = 'd MMM';
const DAY_KEY_FORMAT = 'yyyy-MM-dd';

const separateHoldingLabels: Record<DashboardData['separateHoldings'][number]['key'], string> = {
  epfo: 'EPFO',
  us_stocks: 'US stocks',
};

const formatSignedCurrency = (value: number) => `${value > 0 ? '+' : ''}${formatCurrency(value)}`;

const LiveStatus = ({ asOf, isLive }: { asOf: Date | null; isLive: boolean }) => {
  const zoned = useZonedFormat();
  const isToday = zoned(asOf, DAY_KEY_FORMAT) === zoned(new Date(), DAY_KEY_FORMAT);
  const isOpen = isLive && isToday && isIndianMarketOpen(new Date());
  const closedLabel = isLive ? 'Market closed' : 'Last saved';
  return (
    <div className="text-muted-foreground mt-1 flex min-h-4 items-center gap-1.5 text-xs font-normal">
      {asOf === null ? null : (
        <>
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              isOpen ? 'animate-pulse bg-green-600' : 'bg-muted-foreground',
            )}
          />
          {isOpen ? 'Live' : closedLabel} · as of{' '}
          {zoned(asOf, isToday ? 'h:mm a' : 'd MMM, h:mm a')}
        </>
      )}
    </div>
  );
};

const NumberRow = ({
  label,
  value,
  tone,
  note,
  inline,
}: {
  label: string;
  value: string;
  tone?: string;
  note?: string;
  inline?: { text: string; tone: string };
}) => (
  <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
    <span className="text-muted-foreground text-sm">{label}</span>
    <span className="text-right">
      {inline === undefined ? null : (
        <span className={cn('mr-2 text-xs tabular-nums', inline.tone)}>{inline.text}</span>
      )}
      <span className={cn('font-semibold tabular-nums', tone)}>{value}</span>
      {note === undefined ? null : (
        <span className="text-muted-foreground block text-xs">{note}</span>
      )}
    </span>
  </div>
);

export const YourNumbersCard = ({
  asOf,
  isLive,
  dashboard,
  totalCharges,
}: {
  asOf: Date | null;
  isLive: boolean;
  dashboard: DashboardData;
  totalCharges: number;
}) => {
  const zoned = useZonedFormat();
  const { data: todayEstimate } = api.mutualFundAnalysis.getTodayEstimate.useQuery(undefined, {
    refetchInterval: MS_PER_MINUTE,
  });
  const fundsCategory = dashboard.categoryBreakdown.find((item) => item.category === MUTUAL_FUNDS);
  const fundsToday =
    todayEstimate === undefined
      ? undefined
      : estimateFundsToday(dashboard.instrumentBreakdown, todayEstimate.percents);
  const navDay = zoned(todayEstimate?.navDate ?? null, DAY_FORMAT);
  const oldestNavDay = zoned(todayEstimate?.oldestNavDate ?? null, DAY_FORMAT);
  const navSpan = oldestNavDay === navDay ? navDay : `${oldestNavDay} to ${navDay}`;
  const navLabel =
    todayEstimate?.navDate === null || todayEstimate === undefined ? 'last NAV' : `${navSpan} NAV`;
  const estimateDate = todayEstimate?.estimateDate ?? null;
  const estimateDay =
    zoned(estimateDate, DAY_KEY_FORMAT) === zoned(new Date(), DAY_KEY_FORMAT)
      ? 'today'
      : zoned(estimateDate, DAY_FORMAT);
  return (
    <Card className="md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Your numbers</CardTitle>
        <LiveStatus asOf={asOf} isLive={isLive} />
      </CardHeader>
      <CardContent className="divide-y">
        <NumberRow
          label="Total invested"
          note={totalCharges > 0 ? `+ ${formatCurrency(totalCharges)} charges` : undefined}
          value={formatCurrency(dashboard.summary.investedAmount)}
        />
        <NumberRow
          label="Current value"
          value={formatCurrency(dashboard.summary.valuationAmount)}
        />
        <NumberRow
          label="Unrealised P/L"
          tone={getSignedValueTone(dashboard.summary.pnl)}
          value={formatCurrency(dashboard.summary.pnl)}
        />
        <NumberRow
          label="Realised P/L"
          tone={getSignedValueTone(dashboard.summary.realizedPnl)}
          value={formatCurrency(dashboard.summary.realizedPnl)}
        />
        {fundsCategory === undefined ? (
          <NumberRow
            label="1D change"
            tone={getSignedValueTone(dashboard.summary.dayChange)}
            value={formatCurrency(dashboard.summary.dayChange)}
          />
        ) : (
          <>
            <NumberRow
              label="1D, stocks and others"
              tone={getSignedValueTone(dashboard.summary.dayChange - fundsCategory.dayChange)}
              value={formatCurrency(dashboard.summary.dayChange - fundsCategory.dayChange)}
            />
            <NumberRow
              label={`1D, funds at ${navLabel}`}
              tone={getSignedValueTone(fundsCategory.dayChange)}
              value={formatCurrency(fundsCategory.dayChange)}
            />
            {fundsToday === null || fundsToday === undefined ? null : (
              <NumberRow
                label={`Funds ${estimateDay}, est.`}
                tone={getSignedValueTone(fundsToday)}
                value={formatCurrency(fundsToday)}
              />
            )}
          </>
        )}
        <NumberRow
          label="XIRR"
          tone={
            dashboard.summary.xirr === null ? undefined : getSignedValueTone(dashboard.summary.xirr)
          }
          value={dashboard.summary.xirr === null ? '-' : formatPercent(dashboard.summary.xirr)}
        />
        {dashboard.separateHoldings
          .filter((holding) => holding.openPositions > 0)
          .map((holding) => (
            <NumberRow
              key={holding.key}
              inline={{
                text: `1D ${formatSignedCurrency(holding.dayChange)}`,
                tone: getSignedValueTone(holding.dayChange),
              }}
              label={separateHoldingLabels[holding.key]}
              value={formatCurrency(holding.valuationAmount)}
            />
          ))}
      </CardContent>
    </Card>
  );
};
