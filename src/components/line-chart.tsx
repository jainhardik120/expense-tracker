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
      color: string;
    };
  };
  data: {
    [key: string]: number | string;
  }[];
};

const LineChart = ({ data }: { data: ChartData }) => {
  return (
    <ChartContainer config={data.secondaryAxes satisfies ChartConfig}>
      <RechartsLineChart
        accessibilityLayer
        data={data.data}
        margin={{
          left: 12,
          right: 12,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis axisLine={false} dataKey={data.primaryAxis.key} tickLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {Object.keys(data.secondaryAxes).map((key) => (
          <Line
            key={key}
            activeDot={{
              r: 6,
            }}
            dataKey={key}
            dot={{
              fill: data.secondaryAxes[key].color,
            }}
            stroke={data.secondaryAxes[key].color}
            strokeWidth={2}
            type="natural"
          />
        ))}
      </RechartsLineChart>
    </ChartContainer>
  );
};

export default LineChart;
