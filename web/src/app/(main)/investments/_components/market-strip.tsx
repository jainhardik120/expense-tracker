'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

import FullScreenDialog from '@/components/full-screen-dialog';
import { PriceChart } from '@/components/gain-loss-chart';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { MS_PER_MINUTE } from '@/types';

import { getSignedValueTone } from './investment-columns';
import { MetalChartsDialog } from './metal-charts-dialog';

type MarketItem = RouterOutput['investments']['getMarketSnapshot']['items'][number];
type ChartRange = '1d' | '1w' | '1m';
type IndexKey = 'nifty' | 'sensex';

const PERCENT = 100;
const NUMBER_CELL = 'text-right align-top tabular-nums';
const RANGES: Array<{ value: ChartRange; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
];

const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${formatPercent(value)}`;

const priceLabel = (item: MarketItem, price: number) =>
  item.isCurrency ? formatCurrency(price) : formatNumber(price);

const IndexComponents = ({
  indexKey,
  open,
  range,
}: {
  indexKey: IndexKey;
  open: boolean;
  range: ChartRange;
}) => {
  const { data } = api.investments.getIndexComponents.useQuery(
    { key: indexKey, range },
    { enabled: open, refetchInterval: MS_PER_MINUTE, placeholderData: (previous) => previous },
  );
  if (data === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">Components ({data.components.length})</div>
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="align-top">Stock</TableHead>
            <TableHead className={NUMBER_CELL}>Weight</TableHead>
            <TableHead className={NUMBER_CELL}>Price</TableHead>
            <TableHead className={NUMBER_CELL}>
              {RANGES.find((option) => option.value === range)?.label}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.components.map((component) => (
            <TableRow key={component.name}>
              <TableCell className="whitespace-normal">
                <div>{component.name}</div>
                <div className="text-muted-foreground text-[11px]">{component.sector}</div>
              </TableCell>
              <TableCell className={NUMBER_CELL}>{formatPercent(component.weight)}</TableCell>
              <TableCell className={NUMBER_CELL}>
                {component.price === null ? '-' : formatCurrency(component.price)}
              </TableCell>
              <TableCell
                className={cn(NUMBER_CELL, getSignedValueTone(component.changePercent ?? 0))}
              >
                {component.changePercent === null ? '-' : signedPercent(component.changePercent)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-muted-foreground text-[11px]">
        Weights come from the latest holdings of {data.etfName}, which tracks this index.
      </p>
    </div>
  );
};

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
  const indexKey = item.key === 'nifty' || item.key === 'sensex' ? item.key : null;
  return (
    <div className="flex flex-1 flex-col gap-6 lg:min-h-0 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
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
        <div className="flex min-h-72 flex-1 flex-col">
          {points.length < 2 ? (
            <Skeleton className="size-full" />
          ) : (
            <PriceChart
              currency={item.isCurrency ? 'INR' : 'NONE'}
              fill
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
      {indexKey === null ? null : (
        <div className="lg:w-md lg:shrink-0 lg:overflow-y-auto">
          <IndexComponents indexKey={indexKey} open={open} range={range} />
        </div>
      )}
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
    <FullScreenDialog open={open} setOpen={setOpen} title={item.label} trigger={trigger}>
      <MarketChartBody item={item} open={open} />
    </FullScreenDialog>
  );
};

export const FundAnalysisLink = () => (
  <div className="flex justify-end">
    <Button asChild size="sm" variant="outline">
      <Link href="/investments/mutual-funds">
        Mutual fund analysis
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  </div>
);

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
