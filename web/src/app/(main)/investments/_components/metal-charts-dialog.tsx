'use client';

import { useMemo, useState } from 'react';

import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts';

import FullScreenDialog from '@/components/full-screen-dialog';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatPercent } from '@/lib/format';
import { type AssetClassTagValue } from '@/lib/investments';
import { cn } from '@/lib/utils';
import { SESSION_GAP_MS } from '@/server/helpers/investment/metal-estimates';
import { api } from '@/server/react';
import { MS_PER_HOUR, MS_PER_MINUTE } from '@/types';

import { getSignedValueTone } from './investment-columns';

type Point = { time: number; price: number };

type GridRow = {
  time: number;
  price: number | null;
  estimate: number | null;
  shown: number | null;
};

type Range = '1d' | '1w' | '1m' | '6m' | '1y' | '3y' | '5y';

type TickStyle = 'hour' | 'day' | 'month';

type Series = {
  key: string;
  title: string;
  unit: string;
  currency: 'INR' | 'USD';
  points: Point[];
  estimates: Point[];
  base: number | null;
  stepped: boolean;
};

const RANGES: Array<{ value: Range; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
];

const HOURS_PER_DAY = 24;
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;
const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * MS_PER_MINUTE;
const FINE_GRID_MINUTES = 5;
const FINE_GRID_MS = FINE_GRID_MINUTES * MS_PER_MINUTE;
const HALF_HOUR_MINUTES = 30;
const HALF_HOUR_MS = HALF_HOUR_MINUTES * MS_PER_MINUTE;
const DAY_TICK_HOURS = 3;
const DAY_TICK_MS = DAY_TICK_HOURS * MS_PER_HOUR;
const MONTH_GAP_DAYS = 4;
const MONTH_GAP_MS = MONTH_GAP_DAYS * MS_PER_DAY;
const WEEK_DAYS = 7;
const WEEK_MS = WEEK_DAYS * MS_PER_DAY;
const MONTH_DAYS = 30;
const MONTH_MS = MONTH_DAYS * MS_PER_DAY;
const TWO_MONTHS_DAYS = 61;
const TWO_MONTHS_MS = TWO_MONTHS_DAYS * MS_PER_DAY;
const HALF_YEAR_DAYS = 183;
const HALF_YEAR_MS = HALF_YEAR_DAYS * MS_PER_DAY;
const YEAR_DAYS = 365;
const YEAR_MS = YEAR_DAYS * MS_PER_DAY;

const RANGE_SETTINGS: Record<
  Range,
  { gridMs: number; gapMs: number; tickMs: number; ticks: TickStyle; withTime: boolean }
> = {
  '1d': {
    gridMs: FINE_GRID_MS,
    gapMs: SESSION_GAP_MS,
    tickMs: DAY_TICK_MS,
    ticks: 'hour',
    withTime: true,
  },
  '1w': {
    gridMs: FINE_GRID_MS,
    gapMs: SESSION_GAP_MS,
    tickMs: MS_PER_DAY,
    ticks: 'day',
    withTime: true,
  },
  '1m': {
    gridMs: HALF_HOUR_MS,
    gapMs: MONTH_GAP_MS,
    tickMs: WEEK_MS,
    ticks: 'day',
    withTime: true,
  },
  '6m': { gridMs: MS_PER_DAY, gapMs: WEEK_MS, tickMs: MONTH_MS, ticks: 'day', withTime: false },
  '1y': {
    gridMs: MS_PER_DAY,
    gapMs: WEEK_MS,
    tickMs: TWO_MONTHS_MS,
    ticks: 'month',
    withTime: false,
  },
  '3y': {
    gridMs: MS_PER_DAY,
    gapMs: WEEK_MS,
    tickMs: HALF_YEAR_MS,
    ticks: 'month',
    withTime: false,
  },
  '5y': { gridMs: MS_PER_DAY, gapMs: WEEK_MS, tickMs: YEAR_MS, ticks: 'month', withTime: false },
};

const LINE_STROKE = '#2563eb';
const ESTIMATE_STROKE = '#f59e0b';
const PERCENT = 100;
const SYNC_ID = 'metal-prices';
const FULL_COVERAGE = 99.5;
const BUY_PRICE_STALE_MINUTES = 60;
const LATE_START_SHARE = 0.05;

const toGridTime = (time: number, step: number) =>
  Math.floor((time + IST_OFFSET_MS) / step) * step - IST_OFFSET_MS;

const buildGrid = (series: Point[][], range: Range) => {
  const { gridMs, gapMs } = RANGE_SETTINGS[range];
  const times = [...new Set(series.flat().map((point) => toGridTime(point.time, gridMs)))].sort(
    (left, right) => left - right,
  );
  return times.flatMap((time, index) => {
    const next = times.at(index + 1);
    return next !== undefined && next - time > gapMs ? [time, time + gridMs] : [time];
  });
};

const toLine = (points: Point[], grid: number[], range: Range) => {
  const { gridMs, gapMs } = RANGE_SETTINGS[range];
  const buckets = points.map((point) => ({ ...point, time: toGridTime(point.time, gridMs) }));
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
    return previous !== undefined && next !== undefined && next.time - previous.time <= gapMs
      ? previous.price
      : null;
  });
};

const alignToGrid = (
  points: Point[],
  estimates: Point[],
  grid: number[],
  range: Range,
): GridRow[] => {
  const prices = toLine(points, grid, range);
  const estimated = toLine(estimates, grid, range);
  let shown: number | null = null;
  return grid.map((time, index) => {
    const price = prices.at(index) ?? null;
    const estimate = estimated.at(index) ?? null;
    shown = price ?? estimate ?? shown;
    return { time, price, estimate, shown };
  });
};

const Y_TICK_TARGET = 5;
const Y_PADDING = 1.06;
const MIN_SPREAD = 1.005;
const DECIMAL = 10;
const QUARTER_STEP = 2.5;
const HALF_STEP = 5;
const NICE_STEPS = [1, 2, QUARTER_STEP, HALF_STEP];

type ValueAxis = { domain: [number, number]; ticks: number[] };

const niceStep = (span: number) => {
  const raw = span / Y_TICK_TARGET;
  const magnitude = DECIMAL ** Math.floor(Math.log10(raw));
  return (NICE_STEPS.find((step) => step * magnitude >= raw) ?? DECIMAL) * magnitude;
};

const priceBounds = (item: Series) => {
  const prices = [...item.points, ...item.estimates].map((point) => point.price);
  return prices.length === 0 ? null : { low: Math.min(...prices), high: Math.max(...prices) };
};

const sharedValueAxes = (series: Series[]) => {
  const bounds = series.map(priceBounds);
  const spread =
    Math.max(MIN_SPREAD, ...bounds.map((bound) => (bound === null ? 1 : bound.high / bound.low))) *
    Y_PADDING;
  return bounds.map((bound): ValueAxis | null => {
    if (bound === null) {
      return null;
    }
    const middle = Math.sqrt(bound.low * bound.high);
    const low = middle / Math.sqrt(spread);
    const high = middle * Math.sqrt(spread);
    const step = niceStep(high - low);
    const first = Math.ceil(low / step) * step;
    return {
      domain: [low, high],
      ticks: Array.from(
        { length: Math.floor((high - first) / step) + 1 },
        (_, index) => first + index * step,
      ),
    };
  });
};

const axisTicks = (start: number, end: number, range: Range) => {
  const step = RANGE_SETTINGS[range].tickMs;
  return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => {
    return start + index * step;
  });
};

const hour = (time: number) => new Date(time).toLocaleTimeString('en-IN', { hour: 'numeric' });

const clock = (time: number) =>
  new Date(time).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

const day = (time: number) =>
  new Date(time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const fullDay = (time: number) =>
  new Date(time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const month = (time: number) =>
  new Date(time).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

const TICK_FORMATS: Record<TickStyle, (time: number) => string> = { hour, day, month };

const moment = (time: number, range: Range) =>
  RANGE_SETTINGS[range].withTime ? `${day(time)}, ${clock(time)}` : fullDay(time);

const signedChange = (change: number) => `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;

const summarize = (item: Series, start: number, end: number, range: Range) => {
  const traded = item.points.at(-1);
  const all = [...item.points, ...item.estimates].sort((left, right) => left.time - right.time);
  const first = item.base ?? all.at(0)?.price;
  const last = all.at(-1);
  const firstTime = all.at(0)?.time;
  return {
    last,
    traded,
    isEstimated: last !== undefined && last.time > (traded?.time ?? 0),
    change: first === undefined || last === undefined ? null : (last.price / first - 1) * PERCENT,
    since:
      !RANGE_SETTINGS[range].withTime &&
      firstTime !== undefined &&
      firstTime > start + (end - start) * LATE_START_SHARE
        ? firstTime
        : null,
  };
};

const SeriesTooltip = ({
  active,
  payload,
  currency,
  range,
}: {
  active?: boolean;
  payload?: Array<{ payload: GridRow }>;
  currency: 'INR' | 'USD';
  range: Range;
}) => {
  const point = payload?.[0]?.payload;
  if (active !== true || point === undefined) {
    return null;
  }
  return (
    <div className="bg-background rounded-md border px-2 py-1 text-xs shadow-sm">
      {moment(point.time, range)} · {point.price === null && point.estimate !== null ? 'Est. ' : ''}
      {point.shown === null ? 'No price yet' : formatCurrency(point.shown, currency)}
    </div>
  );
};

const SeriesChart = ({
  item,
  axis,
  grid,
  start,
  end,
  range,
}: {
  item: Series;
  axis: ValueAxis | null;
  grid: number[];
  start: number;
  end: number;
  range: Range;
}) => {
  const rows = useMemo(
    () => alignToGrid(item.points, item.estimates, grid, range),
    [item.points, item.estimates, grid, range],
  );
  return (
    <div className="flex min-h-36 flex-1 flex-col gap-1">
      <span className="text-xs font-medium">{item.title}</span>
      <ChartContainer className="aspect-auto min-h-0 w-full flex-1" config={{}}>
        <LineChart data={rows} margin={{ left: 4, right: 16, top: 4, bottom: 0 }} syncId={SYNC_ID}>
          <CartesianGrid strokeOpacity={0.4} vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="time"
            domain={[start, end]}
            interval="preserveStartEnd"
            minTickGap={16}
            scale="time"
            tick={{ fontSize: 10 }}
            tickFormatter={TICK_FORMATS[RANGE_SETTINGS[range].ticks]}
            tickLine={false}
            ticks={axisTicks(start, end, range)}
            type="number"
          />
          <YAxis
            allowDataOverflow={axis !== null}
            axisLine={false}
            domain={axis?.domain ?? ['auto', 'auto']}
            tickFormatter={(value: number) =>
              formatCurrency(value, item.currency).replace(/\.00$/, '')
            }
            tickLine={false}
            ticks={axis?.ticks}
            width={76}
          />
          <ChartTooltip
            content={<SeriesTooltip currency={item.currency} range={range} />}
            cursor={{ strokeDasharray: '3 3' }}
            filterNull={false}
            isAnimationActive={false}
          />
          <Line
            connectNulls={item.stepped}
            dataKey="price"
            dot={false}
            isAnimationActive={false}
            stroke={LINE_STROKE}
            strokeWidth={2}
            type={item.stepped ? 'stepAfter' : 'linear'}
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

const SeriesFigure = ({
  item,
  start,
  end,
  range,
}: {
  item: Series;
  start: number;
  end: number;
  range: Range;
}) => {
  const { last, traded, isEstimated, change, since } = summarize(item, start, end, range);
  const notes = [
    ...(isEstimated ? ['Estimated'] : []),
    ...(item.stepped || traded === undefined
      ? []
      : [`last ${isEstimated ? 'traded' : 'move'} ${moment(traded.time, range)}`]),
    ...(since === null ? [] : [`data from ${fullDay(since)}`]),
  ];
  return (
    <div className="flex flex-col gap-0.5 py-3">
      <span className="text-muted-foreground text-xs">{item.title}</span>
      {last === undefined ? (
        <span className="text-muted-foreground text-sm">No data for this period</span>
      ) : (
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-semibold tabular-nums">
            {formatCurrency(last.price, item.currency)}
            <span className="text-muted-foreground ml-1 text-xs font-normal">/ {item.unit}</span>
          </span>
          {change === null ? null : (
            <span className={cn('text-sm tabular-nums', getSignedValueTone(change))}>
              {signedChange(change)}
            </span>
          )}
        </span>
      )}
      {notes.length === 0 ? null : (
        <span className="text-muted-foreground text-xs">{notes.join(' · ')}</span>
      )}
    </div>
  );
};

const BuyPriceFigure = ({
  label,
  average,
  current,
  unit,
}: {
  label: string;
  average: number | null;
  current: number | null;
  unit: string;
}) => {
  const change = average === null || current === null ? null : (current / average - 1) * PERCENT;
  return (
    <div className="flex flex-col gap-0.5 py-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-semibold tabular-nums">
          {average === null ? '-' : formatCurrency(average)}
          <span className="text-muted-foreground ml-1 text-xs font-normal">/ {unit}</span>
        </span>
        {change === null ? null : (
          <span className={cn('text-sm tabular-nums', getSignedValueTone(change))}>
            {change > 0 ? '+' : ''}
            {formatPercent(change)}
            <span className="text-muted-foreground text-xs"> now</span>
          </span>
        )}
      </span>
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
    { enabled: open, refetchInterval: MS_PER_MINUTE, placeholderData: (previous) => previous },
  );
  const { data: buyPrices } = api.investments.getMetalBuyPrices.useQuery(undefined, {
    enabled: open,
    staleTime: BUY_PRICE_STALE_MINUTES * MS_PER_MINUTE,
  });
  const buyPrice = buyPrices?.find((item) => item.code === metal);
  const series = useMemo<Series[]>(
    () =>
      data === undefined
        ? []
        : [
            {
              key: 'etf',
              title: `${data.etfName}, as a rate`,
              unit: data.unit,
              currency: 'INR',
              points: data.etf,
              estimates: data.etfEstimate,
              base: data.etfBase,
              stepped: false,
            },
            {
              key: 'mcx',
              title: 'MCX futures',
              unit: data.unit,
              currency: 'INR',
              points: data.mcx,
              estimates: data.mcxEstimate,
              base: data.mcxBase,
              stepped: false,
            },
            {
              key: 'india',
              title: 'India daily rate',
              unit: data.unit,
              currency: 'INR',
              points: data.india,
              estimates: [],
              base: null,
              stepped: true,
            },
            {
              key: 'comex',
              title: 'COMEX, ~10 min delay',
              unit: 'oz',
              currency: 'USD',
              points: data.comex,
              estimates: [],
              base: null,
              stepped: false,
            },
          ],
    [data],
  );
  const grid = useMemo(
    () =>
      buildGrid(
        series.flatMap((item) => [item.points, item.estimates]),
        range,
      ),
    [series, range],
  );
  const axes = useMemo(() => sharedValueAxes(series), [series]);
  const rangeLabel = RANGES.find((option) => option.value === range)?.label;
  const hasEstimates = series.some((item) => item.estimates.length > 0);
  return (
    <FullScreenDialog
      description="All four charts share one clock and one percentage scale, so the same move looks the same size on each."
      open={open}
      setOpen={setOpen}
      title={`${name} price movement`}
      trigger={trigger}
    >
      <div className="flex flex-1 flex-col gap-6 lg:min-h-0 lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {data === undefined ? (
            <Skeleton className="min-h-96 flex-1" />
          ) : (
            series.map((item, index) => (
              <SeriesChart
                key={item.key}
                axis={axes.at(index) ?? null}
                end={data.end}
                grid={grid}
                item={item}
                range={range}
                start={data.start}
              />
            ))
          )}
          <div className="flex flex-wrap justify-center gap-1.5 pt-1 sm:gap-2">
            {RANGES.map((option) => (
              <Button
                key={option.value}
                aria-pressed={option.value === range}
                className="h-7 rounded-full px-2.5 text-xs sm:px-3"
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
        <aside className="flex flex-col gap-6 lg:w-sm lg:shrink-0 lg:overflow-y-auto">
          {buyPrice === undefined || data === undefined ? null : (
            <section className="flex flex-col">
              <h3 className="border-b pb-2 text-sm font-medium">Your average buy</h3>
              <div className="divide-y">
                <BuyPriceFigure
                  average={buyPrice.etf}
                  current={data.etfNow}
                  label="ETF based"
                  unit={data.unit}
                />
                <BuyPriceFigure
                  average={buyPrice.mcx}
                  current={data.mcx.at(-1)?.price ?? null}
                  label={`MCX based${
                    buyPrice.mcxCoverage < FULL_COVERAGE
                      ? ` · ${formatPercent(buyPrice.mcxCoverage, 0)} of buys`
                      : ''
                  }`}
                  unit={data.unit}
                />
              </div>
            </section>
          )}
          {data === undefined ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <section className="flex flex-col">
              <h3 className="border-b pb-2 text-sm font-medium">
                Latest prices · {rangeLabel} change
              </h3>
              <div className="divide-y">
                {series.map((item) => (
                  <SeriesFigure
                    key={item.key}
                    end={data.end}
                    item={item}
                    range={range}
                    start={data.start}
                  />
                ))}
              </div>
            </section>
          )}
          {hasEstimates ? (
            <p className="text-muted-foreground text-xs">
              Dashed amber lines are estimates while that market is closed.
            </p>
          ) : null}
        </aside>
      </div>
    </FullScreenDialog>
  );
};
