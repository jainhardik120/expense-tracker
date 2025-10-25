'use client';

import { useMemo } from 'react';

import { Pie, PieChart as RechartsPieChart } from 'recharts';

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

type ChartData<N extends string, D extends string> = {
  nameKey: N;
  dataKey: D;
  data: {
    [K in N | D]: K extends N ? string : number | string;
  }[];
};

const addColorsToChartData = <N extends string, D extends string>(data: ChartData<N, D>) => {
  const CHART_COLORS_COUNT = 5;
  const chartConfig: ChartConfig = {
    [data.dataKey]: {
      label: data.dataKey.charAt(0).toUpperCase() + data.dataKey.slice(1),
    },
  };

  const dataWithColors = data.data.map((item, index) => {
    const colorIndex = (index % CHART_COLORS_COUNT) + 1;
    const nameValue = item[data.nameKey] as string;
    const nameKey = nameValue.replaceAll(' ', '-');
    chartConfig[nameKey] = {
      label: nameValue.charAt(0).toUpperCase() + nameValue.slice(1),
      color: `var(--chart-${colorIndex})`,
    };

    return {
      ...item,
      fill: `var(--color-${nameKey})`,
    };
  });
  return {
    config: chartConfig,
    data: dataWithColors,
  };
};

const PieChart = <N extends string, D extends string>({
  data,
  innerRadius = 60,
  onClick,
}: {
  data: ChartData<N, D>;
  innerRadius?: number;
  onClick?: (
    data: {
      [K in N | D]: K extends N ? string : number | string;
    },
    index: number,
  ) => void;
}) => {
  const { config, data: chartData } = useMemo(() => addColorsToChartData(data), [data]);

  return (
    <ChartContainer config={config}>
      <RechartsPieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
        <Pie
          data={chartData}
          dataKey={data.dataKey}
          innerRadius={innerRadius}
          nameKey={data.nameKey}
          onClick={onClick}
        />
      </RechartsPieChart>
    </ChartContainer>
  );
};

export default PieChart;
