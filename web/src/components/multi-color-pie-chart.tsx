'use client';

import { useMemo } from 'react';

import { Cell, Pie, PieChart } from 'recharts';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { CATEGORICAL_PALETTE, OTHER_SLICE_COLOR } from '@/lib/chart-palette';

type PieSlice = { label: string; value: number };

const PERCENT = 100;
const OTHER = 'Other';

const colourSlices = (slices: PieSlice[]) => {
  const sorted = slices
    .filter((slice) => slice.value > 0)
    .toSorted((left, right) => right.value - left.value);
  const shown =
    sorted.length <= CATEGORICAL_PALETTE.length + 1
      ? sorted
      : sorted.slice(0, CATEGORICAL_PALETTE.length);
  const rest = sorted.slice(shown.length);
  const colourOf = new Map<string, string>(
    shown.map((slice, index) => [
      slice.label,
      CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length] ?? OTHER_SLICE_COLOR,
    ]),
  );
  const restTotal = rest.reduce((total, slice) => total + slice.value, 0);
  const pie = [
    ...shown.map((slice) => ({ ...slice, fill: colourOf.get(slice.label) ?? OTHER_SLICE_COLOR })),
    ...(rest.length === 0 ? [] : [{ label: OTHER, value: restTotal, fill: OTHER_SLICE_COLOR }]),
  ];
  const all = sorted.map((slice) => ({
    ...slice,
    fill: colourOf.get(slice.label) ?? OTHER_SLICE_COLOR,
  }));
  return { pie, all };
};

const MultiColorPieChart = ({
  slices,
  formatValue,
  innerRadius = 50,
}: {
  slices: PieSlice[];
  formatValue: (value: number) => string;
  innerRadius?: number;
}) => {
  const { pie, all } = useMemo(() => colourSlices(slices), [slices]);
  const total = all.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <div className="flex flex-col gap-3">
      <ChartContainer className="h-55 w-full" config={{}}>
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                valueFormatter={(value) => formatValue(Number(value))}
              />
            }
          />
          <Pie data={pie} dataKey="value" innerRadius={innerRadius} nameKey="label">
            {pie.map((slice) => (
              <Cell key={slice.label} fill={slice.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1 text-xs">
        {all.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: slice.fill }}
            />
            <span className="truncate">{slice.label}</span>
            <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
              {formatValue(slice.value)} ·{' '}
              {(total === 0 ? 0 : (slice.value / total) * PERCENT).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MultiColorPieChart;
