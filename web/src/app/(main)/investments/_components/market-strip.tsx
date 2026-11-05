'use client';

import { useMemo, useState } from 'react';

import { PriceChart } from '@/components/gain-loss-chart';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { MS_PER_MINUTE } from '@/types';

import { getSignedValueTone } from './investment-columns';
import { MetalChartsDialog } from './metal-charts-dialog';

type MarketItem = RouterOutput['investments']['getMarketSnapshot']['items'][number];
type ChartRange = '1d' | '1w' | '1m';

const PERCENT = 100;
const RANGES: Array<{ value: ChartRange; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
];

const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${formatPercent(value)}`;

const priceLabel = (item: MarketItem, price: number) =>
  item.isCurrency ? formatCurrency(price) : formatNumber(price);

const MarketChartBody = ({ item, open }: { item: MarketItem; open: boolean }) => {
  const [range, setRange] = useState<ChartRange>('1d');
  const { data } = api.investments.getMarketChart.useQuery(
    { key: item.key, range },
    { enabled: open, refetchInterval: MS_PER_MINUTE },
  );
  const points = useMemo(() => data?.points ?? [], [data]);
  const first = data?.previousClose ?? points.at(0)?.price;
  const last = points.at(-1)?.price;
  const change = first === undefined || last === undefined ? null : last - first;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-2xl font-semibold tabular-nums">
          {last === undefined ? '-' : priceLabel(item, last)}
        </div>
        {change === null || first === undefined || first === 0 ? null : (
          <div className={cn('text-sm tabular-nums', getSignedValueTone(change))}>
            {change > 0 ? '+' : ''}
            {priceLabel(item, change)} ({signedPercent((change / first) * PERCENT)})
          </div>
        )}
      </div>
      <div className="h-72">
        {points.length < 2 ? (
          <Skeleton className="size-full" />
        ) : (
          <PriceChart
            currency={item.isCurrency ? 'INR' : 'NONE'}
            intraday
            label={item.label}
            points={points}
          />
        )}
      </div>
      <div className="flex justify-center gap-2">
        {RANGES.map((option) => (
          <Button
            key={option.value}
            aria-pressed={option.value === range}
            className="h-7 rounded-full px-3 text-xs"
            size="sm"
            variant={option.value === range ? 'default' : 'outline'}
            onClick={() => {
              setRange(option.value);
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

const MarketTile = ({ item }: { item: MarketItem }) => {
  const [open, setOpen] = useState(false);
  const trigger = (
    <button
      className="hover:bg-muted/50 min-w-32 flex-1 px-4 py-2.5 text-left transition-colors"
      type="button"
    >
      <div className="text-muted-foreground text-xs whitespace-nowrap">{item.label}</div>
      <div className="text-sm font-semibold whitespace-nowrap tabular-nums">
        {item.price === null ? '-' : priceLabel(item, item.price)}
      </div>
      {item.changePercentage === null ? null : (
        <div className={cn('text-xs tabular-nums', getSignedValueTone(item.changePercentage))}>
          {signedPercent(item.changePercentage)}
        </div>
      )}
    </button>
  );
  if (item.key === 'gold' || item.key === 'silver') {
    return (
      <MetalChartsDialog
        metal={item.key}
        name={item.label.replace(' MCX', '')}
        open={open}
        setOpen={setOpen}
        trigger={trigger}
      />
    );
  }
  return (
    <Modal
      className="sm:max-w-2xl"
      open={open}
      setOpen={setOpen}
      title={item.label}
      trigger={trigger}
    >
      <MarketChartBody item={item} open={open} />
    </Modal>
  );
};

export const MarketStrip = () => {
  const { data } = api.investments.getMarketSnapshot.useQuery(undefined, {
    refetchInterval: MS_PER_MINUTE,
  });
  return data === undefined ? (
    <Skeleton className="h-[4.5rem] w-full rounded-xl" />
  ) : (
    <div className="bg-card flex [scrollbar-width:none] divide-x overflow-x-auto rounded-xl border">
      {data.items.map((item) => (
        <MarketTile key={item.key} item={item} />
      ))}
    </div>
  );
};
