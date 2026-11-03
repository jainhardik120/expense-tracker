'use client';

import { useMemo, useState } from 'react';

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

import { rupees } from './format';
import { signedPercent, signedRupees, toneFor } from './today';

type Point = { date: Date; invested: number; value: number; indexValue: number };

const AHEAD = '#16a34a';
const BEHIND = '#dc2626';
const THOUSAND = 1000;
const LAKH = 100_000;
const PERCENT = 100;

const compactRupees = (value: number) => {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absolute >= LAKH) {
    return `${sign}₹${(absolute / LAKH).toFixed(1)}L`;
  }
  if (absolute >= THOUSAND) {
    return `${sign}₹${(absolute / THOUSAND).toFixed(0)}k`;
  }
  return `${sign}₹${absolute.toFixed(0)}`;
};

const monthLabel = (time: number) =>
  new Date(time).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

const dayLabel = (time: number) =>
  new Date(time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

type Row = {
  time: number;
  difference: number;
  relative: number;
  value: number;
  indexValue: number;
  invested: number;
};

type Mode = 'rupees' | 'percent';

const MODES: Array<{ key: Mode; label: string }> = [
  { key: 'rupees', label: '₹' },
  { key: 'percent', label: '%' },
];

const PERCENT_TICK_DECIMALS = 1;

const TooltipBody = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
}) => {
  const row = payload?.[0]?.payload;
  if (active !== true || row === undefined) {
    return null;
  }
  return (
    <div className="bg-background flex min-w-48 flex-col gap-1 rounded-md border px-3 py-2 text-xs shadow-sm">
      <span className="font-medium">{dayLabel(row.time)}</span>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Difference</span>
        <span className={cn('tabular-nums', toneFor(Math.round(row.difference)))}>
          {signedRupees(row.difference)}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Relative to the index</span>
        <span className={cn('tabular-nums', toneFor(Math.round(row.difference)))}>
          {signedPercent(row.relative)}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Your funds</span>
        <span className="tabular-nums">{rupees(row.value)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">In the index</span>
        <span className="tabular-nums">{rupees(row.indexValue)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Invested so far</span>
        <span className="tabular-nums">{rupees(row.invested)}</span>
      </div>
    </div>
  );
};

export const DifferenceChart = ({ points }: { points: Point[] }) => {
  const rows = useMemo(
    () =>
      points.map((point) => ({
        time: point.date.getTime(),
        difference: point.value - point.indexValue,
        relative: point.indexValue === 0 ? 0 : (point.value / point.indexValue - 1) * PERCENT,
        value: point.value,
        indexValue: point.indexValue,
        invested: point.invested,
      })),
    [points],
  );
  const [mode, setMode] = useState<Mode>('rupees');
  const key = mode === 'rupees' ? 'difference' : 'relative';
  const highest = Math.max(0, ...rows.map((row) => row[key]));
  const lowest = Math.min(0, ...rows.map((row) => row[key]));
  const zeroOffset = highest === lowest ? 0 : (highest / (highest - lowest)) * PERCENT;
  if (rows.length < 2) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {mode === 'rupees'
            ? 'Your funds minus the index, over time'
            : 'How far ahead of the index, in %'}
        </span>
        <div className="flex gap-1">
          {MODES.map((item) => (
            <Button
              key={item.key}
              className="h-7 px-2.5"
              size="sm"
              variant={item.key === mode ? 'secondary' : 'ghost'}
              onClick={() => {
                setMode(item.key);
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <ChartContainer className="aspect-auto h-56 w-full" config={{}}>
        <AreaChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="difference-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={AHEAD} stopOpacity={0.35} />
              <stop offset={`${String(zeroOffset)}%`} stopColor={AHEAD} stopOpacity={0.08} />
              <stop offset={`${String(zeroOffset)}%`} stopColor={BEHIND} stopOpacity={0.08} />
              <stop offset="100%" stopColor={BEHIND} stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id="difference-line" x1="0" x2="0" y1="0" y2="1">
              <stop offset={`${String(zeroOffset)}%`} stopColor={AHEAD} />
              <stop offset={`${String(zeroOffset)}%`} stopColor={BEHIND} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeOpacity={0.4} vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="time"
            domain={['dataMin', 'dataMax']}
            minTickGap={40}
            scale="time"
            tickFormatter={monthLabel}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            tickFormatter={
              mode === 'rupees'
                ? compactRupees
                : (value: number) => `${value.toFixed(PERCENT_TICK_DECIMALS)}%`
            }
            tickLine={false}
            width={52}
          />
          <ReferenceLine stroke="currentColor" strokeDasharray="4 4" strokeOpacity={0.5} y={0} />
          <ChartTooltip content={<TooltipBody />} cursor={{ strokeDasharray: '3 3' }} />
          <Area
            dataKey={key}
            fill="url(#difference-fill)"
            isAnimationActive={false}
            stroke="url(#difference-line)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
};
