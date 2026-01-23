'use client';

import { useMemo } from 'react';

import { Pie, PieChart as RechartsPieChart } from 'recharts';

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
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
    let colorIndex = (index % CHART_COLORS_COUNT) + 1;
    if (index === data.data.length - 1 && colorIndex === 1) {
      colorIndex = 2;
    }
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
    <ChartContainer className="aspect-auto h-full min-h-[400]" config={config}>
      <RechartsPieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
        <Pie
          data={chartData}
          dataKey={data.dataKey}
          innerRadius={innerRadius}
          label
          nameKey={data.nameKey}
          onClick={onClick}
        />
        <ChartLegend
          className="mt-auto flex-wrap gap-2 *:basis-1/4 *:justify-center"
          content={<ChartLegendContent nameKey={data.nameKey} />}
        />
      </RechartsPieChart>
    </ChartContainer>
  );
};

export default PieChart;
