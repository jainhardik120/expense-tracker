'use client';

import { useState } from 'react';

import { format } from 'date-fns';
import { LineChart as LineChartIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { MS_PER_MINUTE } from '@/types';

import { getSignedValueTone } from './investment-columns';
import { MetalChartsDialog } from './metal-charts-dialog';

type Metal = RouterOutput['investments']['getMetalPrices'][number];
type MetalPrice = Metal['india'];

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

const MetalPanel = ({ metal }: { metal: Metal }) => {
  const [open, setOpen] = useState(false);
  const unit = `/ ${metal.unit}`;
  return (
    <div className="grid gap-3 rounded-md border p-3">
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

export const MetalPricesCard = () => {
  const { data } = api.investments.getMetalPrices.useQuery(undefined, {
    refetchInterval: MS_PER_MINUTE,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gold and silver prices</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {data === undefined ? (
          <>
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </>
        ) : (
          data.map((metal) => <MetalPanel key={metal.code} metal={metal} />)
        )}
      </CardContent>
    </Card>
  );
};
