'use client';

import { useState } from 'react';

import { format } from 'date-fns';
import { LineChart as LineChartIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { MS_PER_MINUTE } from '@/types';

import { getSignedValueTone } from './investment-columns';
import { MetalChartsDialog } from './metal-charts-dialog';

type Metal = RouterOutput['investments']['getMetalPrices'][number];
type MetalPrice = Metal['india'];
type Indicator = RouterOutput['investments']['getMarketIndicators'][number];

const PriceChange = ({ change }: { change: number | null }) =>
  change === null ? null : (
    <div className={cn('text-sm tabular-nums', getSignedValueTone(change))}>
      {change > 0 ? '+' : ''}
      {formatPercent(change)}
    </div>
  );

const PriceLine = ({
  label,
  price,
  currency,
  unit,
  asOfFormat,
}: {
  label: string;
  price: MetalPrice;
  currency: 'INR' | 'USD';
  unit: string;
  asOfFormat: string;
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <div className="min-w-0">
      <div className="text-muted-foreground text-xs">
        {label}
        {price?.asOf === null || price?.asOf === undefined
          ? null
          : ` · ${format(price.asOf, asOfFormat)}`}
      </div>
      <div className="text-lg font-semibold tabular-nums">
        {price === null ? '-' : formatCurrency(price.price, currency)}
        <span className="text-muted-foreground ml-1 text-xs font-normal">{unit}</span>
      </div>
    </div>
    <PriceChange change={price?.changePercentage ?? null} />
  </div>
);

const LIVE_TIME = 'd MMM, HH:mm';
const PANEL_SPACING =
  'grid content-start gap-3 py-6 first:pt-0 last:pb-0 sm:py-0 sm:first:pr-6 sm:last:pl-6';

const MetalPanel = ({ metal }: { metal: Metal }) => {
  const [open, setOpen] = useState(false);
  const unit = `/ ${metal.unit}`;
  return (
    <div className={PANEL_SPACING}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">{metal.name}</div>
        <MetalChartsDialog
          metal={metal.code}
          name={metal.name}
          open={open}
          setOpen={setOpen}
          trigger={
            <Button className="h-7 px-2 text-xs" size="sm" variant="outline">
              <LineChartIcon className="size-3.5" />
              Compare
            </Button>
          }
        />
      </div>
      <PriceLine
        asOfFormat={LIVE_TIME}
        currency="INR"
        label={
          metal.etf === null
            ? 'ETF rate'
            : `${metal.etf.symbol} at ${formatCurrency(metal.etf.unitPrice)}`
        }
        price={metal.etf}
        unit={unit}
      />
      <PriceLine
        asOfFormat={LIVE_TIME}
        currency="INR"
        label={`MCX ${metal.contract}`}
        price={metal.mcx}
        unit={unit}
      />
      <PriceLine
        asOfFormat="d MMM"
        currency="INR"
        label={metal.code === 'gold' ? 'India 24K daily rate' : 'India daily rate'}
        price={metal.india}
        unit={unit}
      />
      <PriceLine
        asOfFormat={LIVE_TIME}
        currency="USD"
        label="COMEX, ~10 min delay"
        price={metal.comex}
        unit="/ oz"
      />
    </div>
  );
};

const IndicatorFigure = ({ indicator }: { indicator: Indicator }) => {
  const { label, isCurrency, price, changePercentage, asOf } = indicator;
  const value = isCurrency ? formatCurrency(price ?? 0) : formatNumber(price ?? 0);
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-base font-semibold tabular-nums sm:text-lg">
        {price === null ? '-' : value}
      </div>
      <PriceChange change={changePercentage} />
      {asOf === null ? null : (
        <div className="text-muted-foreground text-xs">{format(asOf, LIVE_TIME)}</div>
      )}
    </div>
  );
};

export const MetalPricesCard = () => {
  const { data } = api.investments.getMetalPrices.useQuery(undefined, {
    refetchInterval: MS_PER_MINUTE,
  });
  const { data: indicators } = api.investments.getMarketIndicators.useQuery(undefined, {
    refetchInterval: MS_PER_MINUTE,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Markets</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        {indicators === undefined ? (
          <Skeleton className="h-20" />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {indicators.map((indicator) => (
              <IndicatorFigure key={indicator.label} indicator={indicator} />
            ))}
          </div>
        )}
        <div className="grid divide-y border-t pt-6 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {data === undefined ? (
            <>
              <div className={PANEL_SPACING}>
                <Skeleton className="h-80" />
              </div>
              <div className={PANEL_SPACING}>
                <Skeleton className="h-80" />
              </div>
            </>
          ) : (
            data.map((metal) => <MetalPanel key={metal.code} metal={metal} />)
          )}
        </div>
      </CardContent>
    </Card>
  );
};
