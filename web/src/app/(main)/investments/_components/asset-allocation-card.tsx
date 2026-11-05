'use client';

import { useMemo, useState } from 'react';

import { format } from 'date-fns';
import { Table2 } from 'lucide-react';
import { Cell, Pie, PieChart, type PieLabelRenderProps, type TooltipProps } from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { useIsMobile } from '@/hooks/use-mobile';
import { buildAllocation, expandRing, type AllocationSlice } from '@/lib/asset-allocation';
import { OTHER_SLICE_COLOR } from '@/lib/chart-palette';
import { formatCurrency, formatPercent, formatSignedCurrency } from '@/lib/format';
import { layoutPieLabels, PIE_END_ANGLE, PIE_START_ANGLE } from '@/lib/pie-label-layout';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { MS_PER_MINUTE } from '@/types';

import {
  AssetAllocationDialog,
  type CategoryFigures,
  type ColouredGroup,
  type ColouredSlice,
} from './asset-allocation-dialog';
import { getSignedValueTone } from './investment-columns';

type AssetAllocation =
  RouterOutput['investments']['getInvestmentsInitialData']['dashboard']['assetAllocation'];

const SPLITS_STALE_MINUTES = 60;
const PERCENT = 100;
const SHARE_DECIMALS = 1;
const RING_OVERLAP = 1;
const LABEL_ROW_HEIGHT = 26;
const LABEL_NAME_OFFSET = -3;
const LABEL_SHARE_OFFSET = 9;
const LINE_INSET = 3;

const sliceColors: Record<string, string> = {
  market: '#2563eb',
  gold: '#f59e0b',
  silver: '#0891b2',
  fd: '#7c3aed',
  crypto: '#059669',
  epfo: '#ea580c',
  other: OTHER_SLICE_COLOR,
  mutual_funds: '#4338ca',
  stocks: '#22d3ee',
  'Large cap': '#1e40af',
  'Mid cap': '#3b82f6',
  'Small cap': '#93c5fd',
  International: '#818cf8',
  Debt: '#64748b',
  Cash: '#94a3b8',
  'Real estate': '#c4b5fd',
  Other: OTHER_SLICE_COLOR,
};

const colourSlice = <T extends AllocationSlice>(slice: T) => ({
  ...slice,
  fill: sliceColors[slice.colorKey] ?? OTHER_SLICE_COLOR,
});

const RING_SIZES = {
  desktop: { hole: 15, kinds: 28, market: 40, outer: 52, gap: 12 },
  phone: { hole: 16, kinds: 30, market: 44, outer: 58, gap: 12 },
};

const percentOfChart = (size: number) => `${String(size)}%`;

const signedPercent = (value: number | null) => {
  if (value === null) {
    return '';
  }
  return ` (${value > 0 ? '+' : ''}${formatPercent(value)})`;
};

const TooltipRow = ({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn('font-medium tabular-nums', className)}>{value}</span>
  </div>
);

const AllocationTooltip = ({ active, payload }: TooltipProps<number, string>) => {
  const slice = payload?.[0]?.payload as ColouredSlice | undefined;
  if (active !== true || slice === undefined) {
    return null;
  }
  const pnl = slice.value - slice.invested;
  const previousValue = slice.value - slice.dayChange;
  return (
    <div className="border-border/50 bg-background grid min-w-56 gap-1 rounded-lg border px-2.5 py-2 text-xs shadow-xl">
      <div className="mb-0.5 flex items-center gap-2 font-medium">
        <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: slice.fill }} />
        <span>{slice.label}</span>
        <span className="text-muted-foreground ml-auto pl-2 font-normal tabular-nums">
          {formatPercent(slice.share, SHARE_DECIMALS)}
        </span>
      </div>
      <TooltipRow label="Current value" value={formatCurrency(slice.value)} />
      <TooltipRow label="Invested" value={formatCurrency(slice.invested)} />
      <TooltipRow
        className={getSignedValueTone(pnl)}
        label="Profit/loss"
        value={`${formatSignedCurrency(pnl)}${signedPercent(
          slice.invested === 0 ? null : (pnl / slice.invested) * PERCENT,
        )}`}
      />
      <TooltipRow
        className={getSignedValueTone(slice.dayChange)}
        label="Day change"
        value={`${formatSignedCurrency(slice.dayChange)}${signedPercent(
          previousValue === 0 ? null : (slice.dayChange / previousValue) * PERCENT,
        )}`}
      />
    </div>
  );
};

const OuterLabel = ({
  slices,
  cx,
  cy,
  outerRadius,
  index,
  gap,
}: Partial<PieLabelRenderProps> & { slices: ColouredSlice[]; gap: number }) => {
  const slice = slices.at(index ?? 0);
  const position = layoutPieLabels(
    slices.map((item) => item.value),
    {
      cx: Number(cx),
      cy: Number(cy),
      radius: Number(outerRadius),
      gap,
      rowHeight: LABEL_ROW_HEIGHT,
    },
  ).at(index ?? 0);
  if (slice === undefined || position === undefined) {
    return null;
  }
  const isRight = position.side === 'right';
  const textX = position.x + (isRight ? LINE_INSET : -LINE_INSET);
  const points = [
    [position.anchorX, position.anchorY],
    [position.elbowX, position.elbowY],
    [position.x, position.y],
  ]
    .map((point) => point.join(','))
    .join(' ');
  return (
    <g>
      <polyline
        className="stroke-muted-foreground/60"
        fill="none"
        points={points}
        strokeWidth={1}
      />
      <text
        className="fill-foreground text-[10px]"
        textAnchor={isRight ? 'start' : 'end'}
        x={textX}
        y={position.y + LABEL_NAME_OFFSET}
      >
        {slice.label}
      </text>
      <text
        className="fill-muted-foreground text-[10px] font-semibold tabular-nums"
        textAnchor={isRight ? 'start' : 'end'}
        x={textX}
        y={position.y + LABEL_SHARE_OFFSET}
      >
        {formatPercent(slice.share, SHARE_DECIMALS)}
      </text>
    </g>
  );
};

export const AssetAllocationCard = ({
  allocation,
  categories,
}: {
  allocation: AssetAllocation;
  categories: CategoryFigures[];
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const rings = RING_SIZES[useIsMobile() ? 'phone' : 'desktop'];
  const { data } = api.investments.getMarketSplits.useQuery(undefined, {
    staleTime: SPLITS_STALE_MINUTES * MS_PER_MINUTE,
  });
  const groups = useMemo(
    () =>
      buildAllocation(allocation, data?.splits).map((group): ColouredGroup => ({
        ...colourSlice(group),
        kinds: group.kinds.map(colourSlice),
        buckets: group.buckets.map(colourSlice),
      })),
    [allocation, data],
  );
  const kindRing = expandRing<ColouredSlice>(groups, 'kinds');
  const outerRing = expandRing<ColouredSlice>(groups, 'buckets');
  const holdingsMonth =
    data?.holdingsDate === null || data === undefined
      ? ''
      : ` (${format(data.holdingsDate, 'MMM yyyy')})`;
  const holdingsNote = `Funds and ETFs are split by their latest published holdings${holdingsMonth}, so their invested and day change figures are estimates.`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asset allocation</CardTitle>
        <CardAction>
          <AssetAllocationDialog
            categories={categories}
            description={holdingsNote}
            groups={groups}
            open={detailsOpen}
            setOpen={setDetailsOpen}
            trigger={
              <Button className="h-7 px-2 text-xs" size="sm" variant="outline">
                <Table2 className="size-3.5" />
                More details
              </Button>
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ChartContainer className="aspect-auto min-h-64 w-full flex-1" config={{}}>
          <PieChart>
            <ChartTooltip content={<AllocationTooltip />} />
            <Pie
              data={outerRing}
              dataKey="value"
              endAngle={PIE_END_ANGLE}
              innerRadius={percentOfChart(rings.market)}
              isAnimationActive={false}
              label={<OuterLabel gap={rings.gap} slices={outerRing} />}
              labelLine={false}
              nameKey="label"
              outerRadius={percentOfChart(rings.outer)}
              startAngle={PIE_START_ANGLE}
            >
              {outerRing.map((slice) => (
                <Cell key={slice.key} fill={slice.fill} />
              ))}
            </Pie>
            <Pie
              data={groups}
              dataKey="value"
              endAngle={PIE_END_ANGLE}
              innerRadius={percentOfChart(rings.kinds)}
              isAnimationActive={false}
              nameKey="label"
              outerRadius={percentOfChart(rings.market + RING_OVERLAP)}
              startAngle={PIE_START_ANGLE}
            >
              {groups.map((slice) => (
                <Cell key={slice.key} fill={slice.fill} />
              ))}
            </Pie>
            <Pie
              data={kindRing}
              dataKey="value"
              endAngle={PIE_END_ANGLE}
              innerRadius={percentOfChart(rings.hole)}
              isAnimationActive={false}
              nameKey="label"
              outerRadius={percentOfChart(rings.kinds + RING_OVERLAP)}
              startAngle={PIE_START_ANGLE}
            >
              {kindRing.map((slice) => (
                <Cell key={slice.key} fill={slice.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};
