'use client';

import { useMemo, useState } from 'react';

import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts';

import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import { type AssetClassTagValue } from '@/lib/investments';
import { api } from '@/server/react';
import { MS_PER_HOUR, MS_PER_MINUTE } from '@/types';

type Point = { time: number; price: number };

type GridRow = { time: number; price: number | null; shown: number | null };

type Range = '1d' | '1w';

const RANGES: Array<{ value: Range; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

const LINE_STROKE = '#2563eb';
const PERCENT = 100;
const SYNC_ID = 'metal-prices';
const GRID_MINUTES = 5;
const GRID_MS = GRID_MINUTES * MS_PER_MINUTE;

const toGridTime = (time: number) => Math.floor(time / GRID_MS) * GRID_MS;

const buildGrid = (series: Point[][]) =>
  [...new Set(series.flat().map((point) => toGridTime(point.time)))].sort(
    (left, right) => left - right,
  );

const alignToGrid = (points: Point[], grid: number[]): GridRow[] => {
  const priceByTime = new Map(points.map((point) => [toGridTime(point.time), point.price]));
  let shown: number | null = null;
  return grid.map((time) => {
    const price = priceByTime.get(time) ?? null;
    shown = price ?? shown;
    return { time, price, shown };
  });
};

const TICK_HOURS: Record<Range, number> = { '1d': 3, '1w': 24 };

const axisTicks = (start: number, end: number, range: Range) => {
  const step = TICK_HOURS[range] * MS_PER_HOUR;
  return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => {
    return start + index * step;
  });
};

const clock = (time: number) =>
  new Date(time).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

const day = (time: number) =>
  new Date(time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const signedChange = (change: number) => `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;

const SeriesTooltip = ({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: GridRow }>;
  currency: 'INR' | 'USD';
}) => {
  const point = payload?.[0]?.payload;
  if (active !== true || point === undefined) {
    return null;
  }
  return (
    <div className="bg-background rounded-md border px-2 py-1 text-xs shadow-sm">
      {day(point.time)}, {clock(point.time)} ·{' '}
      {point.shown === null ? 'No price yet' : formatCurrency(point.shown, currency)}
    </div>
  );
};

const SeriesChart = ({
  title,
  unit,
  points,
  grid,
  start,
  end,
  range,
  currency = 'INR',
  stepped = false,
}: {
  title: string;
  unit: string;
  points: Point[];
  grid: number[];
  start: number;
  end: number;
  range: Range;
  currency?: 'INR' | 'USD';
  stepped?: boolean;
}) => {
  const rows = useMemo(() => alignToGrid(points, grid), [points, grid]);
  const first = points.at(0);
  const last = points.at(-1);
  const change =
    first === undefined || last === undefined ? null : (last.price / first.price - 1) * PERCENT;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-medium">{title}</span>
        {last === undefined ? (
          <span className="text-muted-foreground">No data for this period</span>
        ) : (
          <span className="text-muted-foreground tabular-nums">
            {formatCurrency(last.price, currency)} / {unit}
            {change === null ? '' : ` · ${signedChange(change)}`}
            {stepped ? '' : ` · last move ${day(last.time)}, ${clock(last.time)}`}
          </span>
        )}
      </div>
      <ChartContainer className="aspect-auto h-28 w-full" config={{}}>
        <LineChart data={rows} margin={{ left: 4, right: 8, top: 4, bottom: 0 }} syncId={SYNC_ID}>
          <CartesianGrid strokeOpacity={0.4} vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="time"
            domain={[start, end]}
            interval={0}
            scale="time"
            tick={{ fontSize: 10 }}
            tickFormatter={range === '1d' ? clock : day}
            tickLine={false}
            ticks={axisTicks(start, end, range)}
            type="number"
          />
          <YAxis
            axisLine={false}
            domain={['auto', 'auto']}
            tickFormatter={(value: number) => formatCurrency(value, currency).replace(/\.\d+$/, '')}
            tickLine={false}
            width={76}
          />
          <ChartTooltip
            content={<SeriesTooltip currency={currency} />}
            cursor={{ strokeDasharray: '3 3' }}
            filterNull={false}
            isAnimationActive={false}
          />
          <Line
            connectNulls
            dataKey="price"
            dot={false}
            isAnimationActive={false}
            stroke={LINE_STROKE}
            strokeWidth={2}
            type={stepped ? 'stepAfter' : 'linear'}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
};

export const MetalChartsDialog = ({
  metal,
  name,
  open,
  setOpen,
  trigger,
}: {
  metal: AssetClassTagValue;
  name: string;
  open: boolean;
  setOpen: React.Dispatch<boolean>;
  trigger: React.ReactNode;
}) => {
  const [range, setRange] = useState<Range>('1d');
  const { data } = api.investments.getMetalCharts.useQuery(
    { metal, range },
    { enabled: open, refetchInterval: MS_PER_MINUTE },
  );
  const grid = useMemo(
    () => (data === undefined ? [] : buildGrid([data.etf, data.mcx, data.india, data.comex])),
    [data],
  );
  return (
    <Modal
      className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
      description="The same clock runs across all four, so you can see which market moves first."
      open={open}
      setOpen={setOpen}
      title={`${name} price movement`}
      trigger={trigger}
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
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
        {data === undefined ? (
          <Skeleton className="h-[34rem]" />
        ) : (
          <>
            <SeriesChart
              end={data.end}
              grid={grid}
              points={data.etf}
              range={range}
              start={data.start}
              title={`${data.etfSymbol} ETF, as a rate`}
              unit={data.unit}
            />
            <SeriesChart
              end={data.end}
              grid={grid}
              points={data.mcx}
              range={range}
              start={data.start}
              title="MCX futures"
              unit={data.unit}
            />
            <SeriesChart
              end={data.end}
              grid={grid}
              points={data.india}
              range={range}
              start={data.start}
              stepped
              title="India daily rate"
              unit={data.unit}
            />
            <SeriesChart
              currency="USD"
              end={data.end}
              grid={grid}
              points={data.comex}
              range={range}
              start={data.start}
              title="COMEX, ~10 min delay"
              unit="oz"
            />
          </>
        )}
      </div>
    </Modal>
  );
};
