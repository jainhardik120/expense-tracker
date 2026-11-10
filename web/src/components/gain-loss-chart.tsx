'use client';

import { useId, useMemo, useState } from 'react';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

export type GainLossPoint = { date: Date; value: number; base: number; extra?: number };

export type GainLossLabels = {
  value: string;
  base: string;
  extra?: string;
  difference: string;
  relative: string;
};

type Row = {
  index: number;
  time: number;
  value: number;
  base: number;
  extra: number | null;
  difference: number;
  relative: number;
};

type Mode = 'rupees' | 'percent';

const AHEAD = '#16a34a';
const BEHIND = '#dc2626';
const VALUE_STROKE = '#2563eb';
const BASE_STROKE = '#71717a';
const THOUSAND = 1000;
const LAKH = 100_000;
const CRORE = 10_000_000;
const PERCENT = 100;
const MS_PER_DAY = 86_400_000;
const CHART_WRAPPER = 'flex flex-col gap-1';
const chartHeight = (fill: boolean) => cn('aspect-auto w-full', fill ? 'min-h-0 flex-1' : 'h-56');
const LONG_RANGE_DAYS = 120;
const INTRADAY_TICK_MAX_DAYS = 2;
const PERCENT_TICK_DECIMALS = 1;
const LAKH_DECIMALS = 1;
const GAP_FILL_OPACITY = 0.35;
const NEAR_FILL_OPACITY = 0.08;
const AXIS_TICKS = 5;
const FINE_PRICE_DECIMALS = 4;

const sign = (value: number) => {
  if (Math.round(value) === 0) {
    return '';
  }
  return value > 0 ? '+' : '-';
};

const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

const toneFor = (value: number) => {
  if (Math.round(value) === 0) {
    return 'text-muted-foreground';
  }
  return value > 0 ? 'text-green-600' : 'text-red-600';
};

export type ChartCurrency = 'INR' | 'USD' | 'NONE';

type MoneyFormat = {
  symbol: string;
  full: (value: number) => string;
  signed: (value: number) => string;
  compact: (value: number) => string;
  whole: (value: number) => string;
  fine: (value: number) => string;
};

const MILLION = 1_000_000;

const compactIndian = (value: number) => {
  const absolute = Math.abs(value);
  const prefix = value < 0 ? '-₹' : '₹';
  if (absolute >= CRORE) {
    return `${prefix}${(absolute / CRORE).toFixed(LAKH_DECIMALS)}Cr`;
  }
  if (absolute >= LAKH) {
    return `${prefix}${(absolute / LAKH).toFixed(LAKH_DECIMALS)}L`;
  }
  if (absolute >= THOUSAND) {
    return `${prefix}${(absolute / THOUSAND).toFixed(0)}k`;
  }
  return `${prefix}${absolute.toFixed(0)}`;
};

const compactDollars = (value: number) => {
  const absolute = Math.abs(value);
  const prefix = value < 0 ? '-$' : '$';
  if (absolute >= MILLION) {
    return `${prefix}${(absolute / MILLION).toFixed(LAKH_DECIMALS)}M`;
  }
  if (absolute >= THOUSAND) {
    return `${prefix}${(absolute / THOUSAND).toFixed(LAKH_DECIMALS)}k`;
  }
  return `${prefix}${absolute.toFixed(0)}`;
};

const compactFor = (currency: ChartCurrency) => {
  if (currency === 'NONE') {
    return (value: number) => compactIndian(value).replace('₹', '');
  }
  return currency === 'USD' ? compactDollars : compactIndian;
};

const moneyFormat = (currency: ChartCurrency): MoneyFormat => {
  const formatter = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-IN', {
    ...(currency === 'NONE' ? {} : { style: 'currency', currency }),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const wholeFormatter = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-IN', {
    ...(currency === 'NONE' ? {} : { style: 'currency', currency }),
    maximumFractionDigits: 0,
  });
  const fineFormatter = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-IN', {
    ...(currency === 'NONE' ? {} : { style: 'currency', currency }),
    minimumFractionDigits: FINE_PRICE_DECIMALS,
    maximumFractionDigits: FINE_PRICE_DECIMALS,
  });
  const symbols: Record<ChartCurrency, string> = { USD: '$', INR: '₹', NONE: '' };
  return {
    symbol: symbols[currency],
    full: (value) => formatter.format(value),
    signed: (value) => `${sign(value)}${formatter.format(Math.abs(value))}`,
    compact: compactFor(currency),
    whole: (value) => wholeFormatter.format(value),
    fine: (value) => fineFormatter.format(value),
  };
};

const axisFormat = (
  values: number[],
  preferred: (value: number) => string,
  fallback: (value: number) => string,
) => {
  const lowest = Math.min(...values);
  const step = (Math.max(...values) - lowest) / (AXIS_TICKS - 1);
  const labels = Array.from({ length: AXIS_TICKS }, (_, index) => preferred(lowest + index * step));
  return new Set(labels).size === AXIS_TICKS ? preferred : fallback;
};

const percentTick = (value: number) => `${value.toFixed(PERCENT_TICK_DECIMALS)}%`;

const SHORT_DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const MONTH_DATE = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' });
const FULL_DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const SHORT_TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

const shortDate = (time: number) => SHORT_DATE.format(time);

const monthDate = (time: number) => MONTH_DATE.format(time);

const fullDate = (time: number) => FULL_DATE.format(time);

const localDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

const shortTime = (time: number) => SHORT_TIME.format(time);

const fullDateTime = (time: number) => `${fullDate(time)}, ${shortTime(time)}`;

const toRows = (points: GainLossPoint[]): Row[] =>
  points.map((point, index) => ({
    index,
    time: point.date.getTime(),
    value: point.value,
    base: point.base,
    extra: point.extra ?? null,
    difference: point.value - point.base,
    relative: point.base === 0 ? 0 : (point.value / point.base - 1) * PERCENT,
  }));

const Line2 = ({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) => (
  <div className="flex justify-between gap-4">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn('tabular-nums', className)}>{value}</span>
  </div>
);

const TooltipBody = ({
  active,
  payload,
  labels,
  money,
  formatDate,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  labels: GainLossLabels;
  money: MoneyFormat;
  formatDate: (time: number) => string;
}) => {
  const row = payload?.[0]?.payload;
  if (active !== true || row === undefined) {
    return null;
  }
  return (
    <div className="bg-background flex min-w-52 flex-col gap-1 rounded-md border px-3 py-2 text-xs shadow-sm">
      <span className="font-medium">{formatDate(row.time)}</span>
      <Line2
        className={toneFor(row.difference)}
        label={labels.difference}
        value={money.signed(row.difference)}
      />
      <Line2
        className={toneFor(row.difference)}
        label={labels.relative}
        value={signedPercent(row.relative)}
      />
      <Line2 label={labels.value} value={money.full(row.value)} />
      <Line2 label={labels.base} value={money.full(row.base)} />
      {labels.extra === undefined || row.extra === null ? null : (
        <Line2 label={labels.extra} value={money.full(row.extra)} />
      )}
    </div>
  );
};

const spanDays = (times: number[]) => {
  const first = times.at(0) ?? 0;
  const last = times.at(-1) ?? 0;
  return (last - first) / MS_PER_DAY;
};

const tickFormatFor = (times: number[], intraday: boolean) => {
  if (intraday && spanDays(times) < INTRADAY_TICK_MAX_DAYS) {
    return shortTime;
  }
  return spanDays(times) > LONG_RANGE_DAYS ? monthDate : shortDate;
};

const END_PADDING = { right: 10 };

const MAX_MONTH_TICKS = 7;
const QUARTER_MONTHS = 3;
const HALF_YEAR_MONTHS = 6;
const YEAR_MONTHS = 12;
const MONTH_TICK_STEPS = [1, 2, QUARTER_MONTHS, HALF_YEAR_MONTHS, YEAR_MONTHS];

const monthTicks = (times: number[]) => {
  const first = times.at(0);
  const last = times.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const months: Date[] = [];
  const cursor = new Date(first);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() <= last) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const step =
    MONTH_TICK_STEPS.find((size) => months.length / size <= MAX_MONTH_TICKS) ??
    MONTH_TICK_STEPS.at(-1) ??
    1;
  return months.filter((month) => month.getMonth() % step === 0).map((month) => month.getTime());
};

const xAxisProps = (rows: Array<{ time: number }>, intraday: boolean) => {
  const times = rows.map((row) => row.time);
  const format = tickFormatFor(times, intraday);
  if (!intraday) {
    return {
      dataKey: 'time',
      scale: 'time',
      tickFormatter: format,
      padding: END_PADDING,
      ticks: format === monthDate ? monthTicks(times) : undefined,
    } as const;
  }
  const dayStarts = rows.flatMap((row, index) =>
    index === 0 || localDay(rows[index - 1].time) !== localDay(row.time) ? [index] : [],
  );
  return {
    dataKey: 'index',
    padding: END_PADDING,
    scale: 'linear',
    ticks: spanDays(times) < INTRADAY_TICK_MAX_DAYS ? undefined : dayStarts,
    tickFormatter: (index: number) => format(rows[index]?.time ?? 0),
  } as const;
};

const ModeToggle = ({
  mode,
  symbol,
  onChange,
}: {
  mode: Mode;
  symbol: string;
  onChange: (mode: Mode) => void;
}) => (
  <div className="flex gap-1">
    {[
      { key: 'rupees' as const, label: symbol },
      { key: 'percent' as const, label: '%' },
    ].map((item) => (
      <Button
        key={item.key}
        className="h-7 px-2.5"
        size="sm"
        variant={item.key === mode ? 'secondary' : 'ghost'}
        onClick={() => {
          onChange(item.key);
        }}
      >
        {item.label}
      </Button>
    ))}
  </div>
);

export const GainLossChart = ({
  points,
  labels,
  title,
  className,
  fill = false,
  currency = 'INR',
  intraday = false,
}: {
  points: GainLossPoint[];
  labels: GainLossLabels;
  title?: { rupees: string; percent: string };
  className?: string;
  fill?: boolean;
  currency?: ChartCurrency;
  intraday?: boolean;
}) => {
  const money = useMemo(() => moneyFormat(currency), [currency]);
  const [mode, setMode] = useState<Mode>('rupees');
  const rows = useMemo(() => toRows(points), [points]);
  const key = mode === 'rupees' ? 'difference' : 'relative';
  const highest = Math.max(0, ...rows.map((row) => row[key]));
  const lowest = Math.min(0, ...rows.map((row) => row[key]));
  const zeroOffset = highest === lowest ? 0 : (highest / (highest - lowest)) * PERCENT;
  const values = rows.map((row) => row[key]);
  const crossesZero = Math.max(...values) > 0 && Math.min(...values) < 0;
  const solid = Math.max(...values) > 0 ? AHEAD : BEHIND;
  const gradientId = useId().replaceAll(':', '');
  const xAxis = useMemo(() => xAxisProps(rows, intraday), [rows, intraday]);
  if (rows.length < 2) {
    return null;
  }
  return (
    <div className={cn(CHART_WRAPPER, fill && 'h-full', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {mode === 'rupees' ? title?.rupees : title?.percent}
        </span>
        <ModeToggle mode={mode} symbol={money.symbol} onChange={setMode} />
      </div>
      <ChartContainer className={chartHeight(fill)} config={{}}>
        <AreaChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`${gradientId}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={AHEAD} stopOpacity={GAP_FILL_OPACITY} />
              <stop
                offset={`${String(zeroOffset)}%`}
                stopColor={AHEAD}
                stopOpacity={NEAR_FILL_OPACITY}
              />
              <stop
                offset={`${String(zeroOffset)}%`}
                stopColor={BEHIND}
                stopOpacity={NEAR_FILL_OPACITY}
              />
              <stop offset="100%" stopColor={BEHIND} stopOpacity={GAP_FILL_OPACITY} />
            </linearGradient>
            <linearGradient id={`${gradientId}-line`} x1="0" x2="0" y1="0" y2="1">
              <stop offset={`${String(zeroOffset)}%`} stopColor={AHEAD} />
              <stop offset={`${String(zeroOffset)}%`} stopColor={BEHIND} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeOpacity={0.4} vertical={false} />
          <XAxis
            axisLine={false}
            domain={['dataMin', 'dataMax']}
            minTickGap={40}
            tickLine={false}
            type="number"
            {...xAxis}
          />
          <YAxis
            axisLine={false}
            tickFormatter={
              mode === 'rupees'
                ? axisFormat(
                    rows.map((row) => row.difference),
                    money.compact,
                    money.whole,
                  )
                : percentTick
            }
            tickLine={false}
            width={56}
          />
          <ReferenceLine stroke="currentColor" strokeDasharray="4 4" strokeOpacity={0.5} y={0} />
          <ChartTooltip
            content={
              <TooltipBody
                formatDate={intraday ? fullDateTime : fullDate}
                labels={labels}
                money={money}
              />
            }
            cursor={{ strokeDasharray: '3 3' }}
          />
          <Area
            dataKey={key}
            fill={crossesZero ? `url(#${gradientId}-fill)` : solid}
            fillOpacity={crossesZero ? 1 : NEAR_FILL_OPACITY * 2}
            isAnimationActive={false}
            stroke={crossesZero ? `url(#${gradientId}-line)` : solid}
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
};

type ChangeUnit = 'hour' | 'day' | 'week' | 'month';

type ChangeRow = {
  index: number;
  time: number;
  value: number;
  change: number;
  percent: number;
  soldCost: number;
};

const HOURLY_MAX_DAYS = 2;
const DAILY_MAX_DAYS = 400;
const WEEKLY_MAX_DAYS = 1200;
const DAYS_PER_WEEK = 7;
const MONDAY_OFFSET = 6;
const SALE_TOLERANCE = 1;
const SALE_FILL = '#a1a1aa';
const BAR_RADIUS = 2;

const CHANGE_TITLES: Record<ChangeUnit, string> = {
  hour: 'Hourly change',
  day: 'Daily change',
  week: 'Weekly change',
  month: 'Monthly change',
};

const CHANGE_NOUNS: Record<ChangeUnit, string> = {
  hour: 'hours',
  day: 'days',
  week: 'weeks',
  month: 'months',
};

const HOUR_LABEL = new Intl.DateTimeFormat('en-IN', { hour: 'numeric' });
const DAY_LABEL = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

const changeUnitFor = (times: number[], intraday: boolean): ChangeUnit => {
  const days = spanDays(times);
  if (intraday && days < HOURLY_MAX_DAYS) {
    return 'hour';
  }
  if (days <= DAILY_MAX_DAYS) {
    return 'day';
  }
  return days <= WEEKLY_MAX_DAYS ? 'week' : 'month';
};

const bucketStart = (time: number, unit: ChangeUnit) => {
  const date = new Date(time);
  if (unit === 'hour') {
    return date.setMinutes(0, 0, 0);
  }
  date.setHours(0, 0, 0, 0);
  if (unit === 'week') {
    date.setDate(date.getDate() - ((date.getDay() + MONDAY_OFFSET) % DAYS_PER_WEEK));
  }
  if (unit === 'month') {
    date.setDate(1);
  }
  return date.getTime();
};

const bucketLabel = (time: number, unit: ChangeUnit) => {
  if (unit === 'hour') {
    return `${shortDate(time)}, ${HOUR_LABEL.format(time)}`;
  }
  if (unit === 'week') {
    return `Week of ${fullDate(time)}`;
  }
  return unit === 'month' ? MONTH_LABEL.format(time) : DAY_LABEL.format(time);
};

const bucketTick = (time: number, unit: ChangeUnit) => {
  if (unit === 'hour') {
    return HOUR_LABEL.format(time);
  }
  return unit === 'day' ? shortDate(time) : monthDate(time);
};

const toChangeRows = (points: GainLossPoint[], unit: ChangeUnit): ChangeRow[] => {
  const closes = new Map<number, GainLossPoint>();
  for (const point of points) {
    closes.set(bucketStart(point.date.getTime(), unit), point);
  }
  const first = points.at(0);
  const opening =
    unit === 'hour' && first !== undefined ? { value: first.base, base: first.base } : null;
  const buckets = [...closes.entries()];
  return buckets
    .flatMap(([time, point], position) => {
      const previous = position === 0 ? opening : (buckets[position - 1]?.[1] ?? null);
      if (previous === null) {
        return [];
      }
      const change = point.value - point.base - (previous.value - previous.base);
      const soldCost = unit === 'hour' ? 0 : Math.max(0, previous.base - point.base);
      return [
        {
          index: 0,
          time,
          value: point.value,
          change,
          percent: previous.value === 0 ? 0 : (change / previous.value) * PERCENT,
          soldCost: soldCost > SALE_TOLERANCE ? soldCost : 0,
        },
      ];
    })
    .filter((row) => row.change !== 0 || row.soldCost > 0)
    .map((row, index) => ({ ...row, index }));
};

const ChangeTooltip = ({
  active,
  payload,
  money,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChangeRow }>;
  money: MoneyFormat;
  unit: ChangeUnit;
}) => {
  const row = payload?.[0]?.payload;
  if (active !== true || row === undefined) {
    return null;
  }
  return (
    <div className="bg-background flex max-w-64 min-w-52 flex-col gap-1 rounded-md border px-3 py-2 text-xs shadow-sm">
      <span className="font-medium">{bucketLabel(row.time, unit)}</span>
      <Line2 className={toneFor(row.change)} label="Change" value={money.signed(row.change)} />
      <Line2 className={toneFor(row.change)} label="Change %" value={signedPercent(row.percent)} />
      <Line2 label="Value at close" value={money.full(row.value)} />
      {row.soldCost > 0 ? (
        <span className="text-muted-foreground">
          Includes a sale of {money.full(row.soldCost)} at cost. Its profit or loss moved out of
          this chart, so this bar mixes the sale with the market move.
        </span>
      ) : null}
    </div>
  );
};

const extremeRow = (rows: ChangeRow[], pick: (left: number, right: number) => boolean) =>
  rows
    .filter((row) => row.soldCost === 0)
    .reduce<ChangeRow | null>(
      (best, row) => (best === null || pick(row.change, best.change) ? row : best),
      null,
    );

const ChangeSummary = ({
  rows,
  money,
  unit,
}: {
  rows: ChangeRow[];
  money: MoneyFormat;
  unit: ChangeUnit;
}) => {
  const signedWhole = (value: number) => `${sign(value)}${money.whole(Math.abs(value))}`;
  const market = rows.filter((row) => row.soldCost === 0);
  const up = market.filter((row) => Math.round(row.change) > 0).length;
  const down = market.filter((row) => Math.round(row.change) < 0).length;
  const best = extremeRow(rows, (left, right) => left > right);
  const worst = extremeRow(rows, (left, right) => left < right);
  return (
    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span>
        <span className="text-green-600 tabular-nums">{up}</span> up ·{' '}
        <span className="text-red-600 tabular-nums">{down}</span> down {CHANGE_NOUNS[unit]}
      </span>
      {best === null || best.change <= 0 ? null : (
        <span>
          Best <span className="text-green-600 tabular-nums">{signedWhole(best.change)}</span> (
          {bucketTick(best.time, unit)})
        </span>
      )}
      {worst === null || worst.change >= 0 ? null : (
        <span>
          Worst <span className="text-red-600 tabular-nums">{signedWhole(worst.change)}</span> (
          {bucketTick(worst.time, unit)})
        </span>
      )}
    </div>
  );
};

const barFill = (row: ChangeRow) => {
  if (row.soldCost > 0) {
    return SALE_FILL;
  }
  return row.change >= 0 ? AHEAD : BEHIND;
};

export const PeriodChangeChart = ({
  points,
  className,
  currency = 'INR',
  intraday = false,
}: {
  points: GainLossPoint[];
  className?: string;
  currency?: ChartCurrency;
  intraday?: boolean;
}) => {
  const money = useMemo(() => moneyFormat(currency), [currency]);
  const [mode, setMode] = useState<Mode>('rupees');
  const unit = changeUnitFor(
    points.map((point) => point.date.getTime()),
    intraday,
  );
  const rows = useMemo(() => toChangeRows(points, unit), [points, unit]);
  const key = mode === 'rupees' ? 'change' : 'percent';
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground flex size-full items-center justify-center rounded-md border border-dashed text-sm">
        No changes in this range yet.
      </div>
    );
  }
  return (
    <div className={cn(CHART_WRAPPER, 'h-full', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {CHANGE_TITLES[unit]}, {mode === 'rupees' ? `in ${money.symbol}` : 'as % of value'}
        </span>
        <ModeToggle mode={mode} symbol={money.symbol} onChange={setMode} />
      </div>
      <ChangeSummary money={money} rows={rows} unit={unit} />
      <ChartContainer className={chartHeight(true)} config={{}}>
        <BarChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeOpacity={0.4} vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="index"
            interval="preserveStartEnd"
            minTickGap={40}
            tickFormatter={(index: number) => bucketTick(rows[index]?.time ?? 0, unit)}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            tickFormatter={
              mode === 'rupees'
                ? axisFormat(
                    rows.map((row) => row.change),
                    money.compact,
                    money.whole,
                  )
                : percentTick
            }
            tickLine={false}
            width={56}
          />
          <ReferenceLine stroke="currentColor" strokeOpacity={0.5} y={0} />
          <ChartTooltip
            content={<ChangeTooltip money={money} unit={unit} />}
            cursor={{ fillOpacity: 0.1 }}
          />
          <Bar dataKey={key} isAnimationActive={false} radius={BAR_RADIUS}>
            {rows.map((row) => (
              <Cell key={row.time} fill={barFill(row)} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export const ValueVsBaseChart = ({
  points,
  labels,
  className,
  fill = false,
  currency = 'INR',
  intraday = false,
}: {
  points: GainLossPoint[];
  labels: GainLossLabels;
  className?: string;
  fill?: boolean;
  currency?: ChartCurrency;
  intraday?: boolean;
}) => {
  const money = useMemo(() => moneyFormat(currency), [currency]);
  const rows = useMemo(() => toRows(points), [points]);
  const xAxis = useMemo(() => xAxisProps(rows, intraday), [rows, intraday]);
  if (rows.length < 2) {
    return null;
  }
  return (
    <div className={cn(CHART_WRAPPER, fill && 'h-full', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: VALUE_STROKE }} />
          {labels.value}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: BASE_STROKE }} />
          {labels.base}
        </span>
      </div>
      <ChartContainer className={chartHeight(fill)} config={{}}>
        <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeOpacity={0.4} vertical={false} />
          <XAxis
            axisLine={false}
            domain={['dataMin', 'dataMax']}
            minTickGap={40}
            tickLine={false}
            type="number"
            {...xAxis}
          />
          <YAxis
            axisLine={false}
            domain={['auto', 'auto']}
            tickFormatter={axisFormat(
              rows.flatMap((row) => [row.value, row.base]),
              money.compact,
              money.whole,
            )}
            tickLine={false}
            width={56}
          />
          <ChartTooltip
            content={
              <TooltipBody
                formatDate={intraday ? fullDateTime : fullDate}
                labels={labels}
                money={money}
              />
            }
            cursor={{ strokeDasharray: '3 3' }}
          />
          <Line
            dataKey="base"
            dot={false}
            isAnimationActive={false}
            stroke={BASE_STROKE}
            strokeDasharray="5 4"
            strokeWidth={2}
            type="stepAfter"
          />
          <Line
            dataKey="value"
            dot={false}
            isAnimationActive={false}
            stroke={VALUE_STROKE}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
};

type PricePoint = { date: Date; price: number };

const PRICE_DECIMALS = 2;
const COMPACT_PRICE_FROM = 10_000;
const PRICE_DOMAIN_PADDING = 0.05;

const PriceTooltip = ({
  active,
  payload,
  formatPrice,
  formatDate,
  averageBuyPrice,
  seriesLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: { time: number; price: number } }>;
  formatPrice: (value: number) => string;
  formatDate: (time: number) => string;
  averageBuyPrice: number | null;
  seriesLabel: string;
}) => {
  const row = payload?.[0]?.payload;
  if (active !== true || row === undefined) {
    return null;
  }
  return (
    <div className="bg-background flex min-w-40 flex-col gap-1 rounded-md border px-3 py-2 text-xs shadow-sm">
      <span className="font-medium">{formatDate(row.time)}</span>
      <Line2 label={seriesLabel} value={formatPrice(row.price)} />
      {averageBuyPrice === null ? null : (
        <Line2 label="Avg buy price" value={formatPrice(averageBuyPrice)} />
      )}
    </div>
  );
};

const priceDomain = (
  rows: Array<{ price: number }>,
  averageBuyPrice: number | null,
): [number | string, number | string] => {
  if (averageBuyPrice === null) {
    return ['auto', 'auto'];
  }
  const prices = [...rows.map((row) => row.price), averageBuyPrice];
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const padding = (highest - lowest) * PRICE_DOMAIN_PADDING;
  return [lowest - padding, highest + padding];
};

export const PriceChart = ({
  points,
  currency = 'INR',
  className,
  fill = false,
  intraday = false,
  averageBuyPrice = null,
  firstBought = null,
  label = 'Unit price',
}: {
  points: PricePoint[];
  currency?: ChartCurrency;
  className?: string;
  fill?: boolean;
  intraday?: boolean;
  averageBuyPrice?: number | null;
  firstBought?: Date | null;
  label?: string;
}) => {
  const money = useMemo(() => moneyFormat(currency), [currency]);
  const rows = useMemo(
    () => points.map((point, index) => ({ index, time: point.date.getTime(), price: point.price })),
    [points],
  );
  const firstBoughtRow =
    firstBought === null ? undefined : rows.find((row) => row.time >= firstBought.getTime());
  const formatPrice = useMemo(() => {
    const formatter = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-IN', {
      ...(currency === 'NONE' ? {} : { style: 'currency', currency }),
      minimumFractionDigits: PRICE_DECIMALS,
      maximumFractionDigits: PRICE_DECIMALS,
    });
    return (value: number) => formatter.format(value);
  }, [currency]);
  const highest = Math.max(0, ...rows.map((row) => row.price));
  const axisPrices = [
    ...rows.map((row) => row.price),
    ...(averageBuyPrice === null ? [] : [averageBuyPrice]),
  ];
  const tick =
    highest >= COMPACT_PRICE_FROM
      ? axisFormat(axisPrices, money.compact, money.whole)
      : axisFormat(axisPrices, formatPrice, money.fine);
  const xAxis = useMemo(() => xAxisProps(rows, intraday), [rows, intraday]);
  if (rows.length < 2) {
    return null;
  }
  return (
    <div className={cn(CHART_WRAPPER, fill && 'h-full', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-sm font-medium">{label}</span>
        {averageBuyPrice === null ? null : (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: BASE_STROKE }} />
            Avg buy price {formatPrice(averageBuyPrice)}
          </span>
        )}
      </div>
      <ChartContainer className={chartHeight(fill)} config={{}}>
        <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeOpacity={0.4} vertical={false} />
          <XAxis
            axisLine={false}
            domain={['dataMin', 'dataMax']}
            minTickGap={40}
            tickLine={false}
            type="number"
            {...xAxis}
          />
          <YAxis
            axisLine={false}
            domain={priceDomain(rows, averageBuyPrice)}
            tickFormatter={tick}
            tickLine={false}
            width={64}
          />
          <ChartTooltip
            content={
              <PriceTooltip
                averageBuyPrice={averageBuyPrice}
                formatDate={intraday ? fullDateTime : fullDate}
                formatPrice={formatPrice}
                seriesLabel={label}
              />
            }
            cursor={{ strokeDasharray: '3 3' }}
          />
          {averageBuyPrice === null ? null : (
            <ReferenceLine
              stroke={BASE_STROKE}
              strokeDasharray="5 4"
              strokeWidth={2}
              y={averageBuyPrice}
            />
          )}
          {firstBoughtRow === undefined || firstBoughtRow.index === 0 ? null : (
            <ReferenceLine
              stroke={BASE_STROKE}
              strokeDasharray="5 4"
              x={intraday ? firstBoughtRow.index : firstBoughtRow.time}
            />
          )}
          <Line
            dataKey="price"
            dot={false}
            isAnimationActive={false}
            stroke={VALUE_STROKE}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
};
