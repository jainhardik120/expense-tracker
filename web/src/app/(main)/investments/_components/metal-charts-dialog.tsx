'use client';

import { useMemo, useState } from 'react';

import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts';

import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import { type AssetClassTagValue } from '@/lib/investments';
import { SESSION_GAP_MS } from '@/server/helpers/investment/metal-estimates';
import { api } from '@/server/react';
import { MS_PER_HOUR, MS_PER_MINUTE } from '@/types';

type Point = { time: number; price: number };

type GridRow = {
  time: number;
  price: number | null;
  estimate: number | null;
  shown: number | null;
};

type Range = '1d' | '1w';

const RANGES: Array<{ value: Range; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

const LINE_STROKE = '#2563eb';
const ESTIMATE_STROKE = '#f59e0b';
const NO_ESTIMATES: Point[] = [];
const PERCENT = 100;
const SYNC_ID = 'metal-prices';
const SHEET_HEIGHT =
  'pb-4 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:h-[96dvh] data-[vaul-drawer-direction=bottom]:max-h-[96dvh]';
const GRID_MINUTES = 5;
const GRID_MS = GRID_MINUTES * MS_PER_MINUTE;

const toGridTime = (time: number) => Math.floor(time / GRID_MS) * GRID_MS;

const buildGrid = (series: Point[][]) => {
  const times = [...new Set(series.flat().map((point) => toGridTime(point.time)))].sort(
    (left, right) => left - right,
  );
  return times.flatMap((time, index) => {
    const next = times.at(index + 1);
    return next !== undefined && next - time > SESSION_GAP_MS ? [time, time + GRID_MS] : [time];
  });
};

const toLine = (points: Point[], grid: number[]) => {
  const buckets = points.map((point) => ({ ...point, time: toGridTime(point.time) }));
  let nextIndex = 0;
  return grid.map((time) => {
    while ((buckets.at(nextIndex)?.time ?? time) < time) {
      nextIndex += 1;
    }
    const next = buckets.at(nextIndex);
    if (next?.time === time) {
      return next.price;
    }
    const previous = nextIndex === 0 ? undefined : buckets.at(nextIndex - 1);
    return previous !== undefined &&
      next !== undefined &&
      next.time - previous.time <= SESSION_GAP_MS
      ? previous.price
      : null;
  });
};

const alignToGrid = (points: Point[], estimates: Point[], grid: number[]): GridRow[] => {
  const prices = toLine(points, grid);
  const estimated = toLine(estimates, grid);
  let shown: number | null = null;
  return grid.map((time, index) => {
    const price = prices.at(index) ?? null;
    const estimate = estimated.at(index) ?? null;
    shown = price ?? estimate ?? shown;
    return { time, price, estimate, shown };
  });
};

const TICK_HOURS: Record<Range, number> = { '1d': 3, '1w': 24 };

const axisTicks = (start: number, end: number, range: Range) => {
  const step = TICK_HOURS[range] * MS_PER_HOUR;
  return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => {
    return start + index * step;
  });
};

const hour = (time: number) => new Date(time).toLocaleTimeString('en-IN', { hour: 'numeric' });

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
      {point.price === null && point.estimate !== null ? 'Est. ' : ''}
      {point.shown === null ? 'No price yet' : formatCurrency(point.shown, currency)}
    </div>
  );
};

const SeriesChart = ({
  title,
  unit,
  points,
  estimates = NO_ESTIMATES,
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
  estimates?: Point[];
  grid: number[];
  start: number;
  end: number;
  range: Range;
  currency?: 'INR' | 'USD';
  stepped?: boolean;
}) => {
  const rows = useMemo(() => alignToGrid(points, estimates, grid), [points, estimates, grid]);
  const traded = points.at(-1);
  const series = [...points, ...estimates].sort((left, right) => left.time - right.time);
  const first = series.at(0);
  const last = series.at(-1);
  const isEstimated = last !== undefined && last.time > (traded?.time ?? 0);
  const lastLabel = isEstimated ? 'traded' : 'move';
  const change =
    first === undefined || last === undefined ? null : (last.price / first.price - 1) * PERCENT;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 md:flex-none">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-medium">{title}</span>
        {last === undefined ? (
          <span className="text-muted-foreground">No data for this period</span>
        ) : (
          <span className="text-muted-foreground tabular-nums">
            {isEstimated ? 'Est. ' : ''}
            {formatCurrency(last.price, currency)} / {unit}
            {change === null ? '' : ` · ${signedChange(change)}`}
            {stepped || traded === undefined
              ? ''
              : ` · last ${lastLabel} ${day(traded.time)}, ${clock(traded.time)}`}
          </span>
        )}
      </div>
      <ChartContainer
        className="aspect-auto min-h-16 w-full flex-1 md:h-28 md:flex-none"
        config={{}}
      >
        <LineChart data={rows} margin={{ left: 4, right: 16, top: 4, bottom: 0 }} syncId={SYNC_ID}>
          <CartesianGrid strokeOpacity={0.4} vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="time"
            domain={[start, end]}
            interval={0}
            scale="time"
            tick={{ fontSize: 10 }}
            tickFormatter={range === '1d' ? hour : day}
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
            connectNulls={stepped}
            dataKey="price"
            dot={false}
            isAnimationActive={false}
            stroke={LINE_STROKE}
            strokeWidth={2}
            type={stepped ? 'stepAfter' : 'linear'}
          />
          <Line
            dataKey="estimate"
            dot={false}
            isAnimationActive={false}
            stroke={ESTIMATE_STROKE}
            strokeDasharray="4 3"
            strokeWidth={2}
            type="linear"
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
    () =>
      data === undefined
        ? []
        : buildGrid([
            data.etf,
            data.etfEstimate,
            data.mcx,
            data.mcxEstimate,
            data.india,
            data.comex,
          ]),
    [data],
  );
  return (
    <Modal
      className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
      description="One clock across all four. Dashed amber lines are estimates while that market is closed."
      drawerClassName={SHEET_HEIGHT}
      open={open}
      setOpen={setOpen}
      title={`${name} price movement`}
      trigger={trigger}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
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
          <Skeleton className="min-h-0 flex-1 md:h-[34rem] md:flex-none" />
        ) : (
          <>
            <SeriesChart
              end={data.end}
              estimates={data.etfEstimate}
              grid={grid}
              points={data.etf}
              range={range}
              start={data.start}
              title={`${data.etfSymbol} ETF, as a rate`}
              unit={data.unit}
            />
            <SeriesChart
              end={data.end}
              estimates={data.mcxEstimate}
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
