'use client';

import { useMemo } from 'react';

import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis } from 'recharts';

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

type ChartData = {
  primaryAxis: {
    key: string;
    label: string;
  };
  secondaryAxes: {
    [key: string]: {
      label: string;
    };
  };
  data: {
    [key: string]: number | string;
  }[];
};

const addColorsToChartData = (data: ChartData) => {
  const CHART_COLORS_COUNT = 5;
  const chartConfig: ChartConfig = {};
  const secondaryAxesKeys = Object.keys(data.secondaryAxes);

  for (const [index, key] of secondaryAxesKeys.entries()) {
    const colorIndex = (index % CHART_COLORS_COUNT) + 1;
    chartConfig[key] = {
      label: data.secondaryAxes[key].label,
      color: `var(--chart-${colorIndex})`,
    };
  }
  return {
    ...data,
    secondaryAxes: chartConfig,
  };
};

const LineChart = ({ data }: { data: ChartData }) => {
  const dataWithColors = useMemo(() => addColorsToChartData(data), [data]);
  return (
    <ChartContainer config={dataWithColors.secondaryAxes}>
      <RechartsLineChart
        accessibilityLayer
        data={dataWithColors.data}
        margin={{
          left: 12,
          right: 12,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey={dataWithColors.primaryAxis.key}
          tickLine={false}
          tickMargin={8}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {Object.keys(dataWithColors.secondaryAxes).map((key) => (
          <Line
            key={key}
            activeDot={{
              r: 6,
            }}
            dataKey={key}
            dot={{
              fill: dataWithColors.secondaryAxes[key].color,
            }}
            stroke={dataWithColors.secondaryAxes[key].color}
            strokeWidth={2}
            type="natural"
          />
        ))}
      </RechartsLineChart>
    </ChartContainer>
  );
};

export default LineChart;
