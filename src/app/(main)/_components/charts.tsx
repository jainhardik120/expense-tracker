'use client';

import { useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';

import LineChart from '@/components/line-chart';
import PieChart from '@/components/pie-chart';
import { useTimezone } from '@/components/time-zone-setter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatTruncatedDate } from '@/lib/date';
import type {
  AggregatedAccountTransferSummary,
  AggregatedFriendTransferSummary,
  DateRange,
  DateTruncUnit,
} from '@/types';

export const ExpensesLineChart = ({
  data,
  unit,
  range,
  allCategories,
}: {
  data: { date: Date; expenses: number; categoryWiseSummary: Record<string, number> }[];
  unit: DateTruncUnit;
  range: DateRange;
  allCategories: string[];
}) => {
  const timezone = useTimezone();
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(allCategories),
  );

  const toggleAllCategories = () => {
    if (selectedCategories.size === allCategories.length) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(allCategories));
    }
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const categoryWiseDataLabels = useMemo(() => {
    const labels: Record<string, { label: string }> = {};
    for (const category of selectedCategories) {
      labels[category] = {
        label: category,
      };
    }
    return labels;
  }, [selectedCategories]);

  const chartData = useMemo(() => {
    return data.map((d) => {
      const filteredData: Record<string, string | number> = {
        date: formatTruncatedDate(d.date, unit, timezone),
      };

      let total = 0;
      for (const category of selectedCategories) {
        const amount = d.categoryWiseSummary[category];
        filteredData[category] = amount;
        total += amount;
      }

      if (selectedCategories.size > 0) {
        filteredData['total'] = total;
      }

      return filteredData;
    });
  }, [data, selectedCategories, unit, timezone]);

  const finalDataLabels = useMemo(() => {
    if (selectedCategories.size === 0) {
      return categoryWiseDataLabels;
    }
    return {
      ...categoryWiseDataLabels,
      total: { label: 'Total' },
    };
  }, [categoryWiseDataLabels, selectedCategories.size]);

  const allChecked = selectedCategories.size === allCategories.length;
  const someChecked = selectedCategories.size > 0 && selectedCategories.size < allCategories.length;

  let selectAllCheckboxState: boolean | 'indeterminate';
  if (allChecked) {
    selectAllCheckboxState = true;
  } else if (someChecked) {
    selectAllCheckboxState = 'indeterminate';
  } else {
    selectAllCheckboxState = false;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expenses</CardTitle>
        <CardDescription>
          From: {formatTruncatedDate(range.start, unit, timezone)} To:{' '}
          {formatTruncatedDate(range.end, unit, timezone)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center space-x-2 border-b pb-2">
            <Checkbox
              checked={selectAllCheckboxState}
              id="toggle-all"
              onCheckedChange={toggleAllCategories}
            />
            <Label className="cursor-pointer font-semibold" htmlFor="toggle-all">
              Select All Categories
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {allCategories.map((category) => (
              <div key={category} className="flex items-center space-x-2">
                <Checkbox
                  checked={selectedCategories.has(category)}
                  id={`category-${category}`}
                  onCheckedChange={() => {
                    toggleCategory(category);
                  }}
                />
                <Label className="cursor-pointer text-sm" htmlFor={`category-${category}`}>
                  {category}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <LineChart
          data={{
            primaryAxis: {
              key: 'date',
              label: 'Date',
            },
            secondaryAxes: finalDataLabels,
            data: chartData,
          }}
        />
      </CardContent>
    </Card>
  );
};

export const CategoryExpensesPieChart = ({
  data,
  range,
}: {
  data: { category: string; amount: number }[];
  range: DateRange;
}) => {
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Expenses by Category</CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col">
        <PieChart
          data={{
            nameKey: 'category',
            dataKey: 'amount',
            data: data,
          }}
          innerRadius={0}
          onClick={(data) => {
            router.push(
              `/statements?category=${data.category}&date=${range.start.getTime()},${range.end.getTime()}`,
            );
          }}
        />
      </CardContent>
    </Card>
  );
};

type SummaryData = {
  myExpensesTotal: number;
  aggregatedAccountsSummaryData: AggregatedAccountTransferSummary;
  aggregatedFriendsSummaryData: AggregatedFriendTransferSummary;
};

const constructOverlayBarData = (data: SummaryData) => {
  const CHART_COLORS_COUNT = 5;

  const rawData = [
    {
      label: 'My Starting Balance',
      change:
        data.aggregatedAccountsSummaryData.startingBalance -
        data.aggregatedFriendsSummaryData.startingBalance,
      name: 'my-starting-balance',
    },
    {
      label: 'Friend Starting Balance',
      change: data.aggregatedFriendsSummaryData.startingBalance,
      name: 'friend-starting-balance',
    },
    {
      label: 'Outside Transactions',
      change: data.aggregatedAccountsSummaryData.outsideTransactions,
      name: 'outside-transactions',
    },
    {
      label: 'Friend Transactions',
      change:
        data.aggregatedAccountsSummaryData.friendTransactions -
        data.aggregatedFriendsSummaryData.splits +
        data.aggregatedFriendsSummaryData.paidByFriend,
      name: 'friend-transactions',
    },
    {
      label: 'Expenses',
      change: -1 * data.myExpensesTotal,
      name: 'expenses',
    },
    {
      label: 'Friend Balance',
      change: data.aggregatedFriendsSummaryData.finalBalance,
      changeDirection: true,
      name: 'friend-balance',
    },
    {
      label: 'My Balance',
      change:
        data.aggregatedAccountsSummaryData.finalBalance -
        data.aggregatedFriendsSummaryData.finalBalance,
      changeDirection: true,
      name: 'my-balance',
    },
  ];

  let start = 0;
  return rawData.map((d, index) => {
    const colorIndex = (index % CHART_COLORS_COUNT) + 1;

    const a = start;
    if (d.changeDirection === true) {
      start -= d.change;
    } else {
      start += d.change;
    }
    const b = start;
    return {
      label: d.label,
      name: d.name,
      value: d.change.toFixed(2),
      color: `var(--chart-${colorIndex})`,
      range: [Math.min(a, b), Math.max(a, b)],
    };
  });
};

export const SummaryCard = ({ data }: { data: SummaryData }) => {
  const overlayBarData = useMemo(() => constructOverlayBarData(data), [data]);
  const chartConfig = useMemo(() => {
    return Object.fromEntries(
      overlayBarData.map((d) => [d.name, { label: d.label, color: d.color }]),
    );
  }, [overlayBarData]);
  const chartData = useMemo(() => {
    return overlayBarData.map((d) => {
      return { name: d.name, range: d.range, fill: `var(--color-${d.name})`, value: d.value };
    });
  }, [overlayBarData]);
  return (
    <Card className="col-span-1 md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col">
        <ChartContainer className="mt-auto h-full" config={chartConfig}>
          <BarChart
            accessibilityLayer
            barCategoryGap={2}
            data={chartData}
            layout="vertical"
            margin={{
              left: 10,
              right: 100,
            }}
          >
            <XAxis dataKey="range" hide type="number" />
            <CartesianGrid horizontal={false} />
            <YAxis
              axisLine={false}
              dataKey="name"
              tickFormatter={(value) => chartConfig[value as keyof typeof chartConfig].label}
              tickLine={false}
              tickMargin={10}
              type="category"
              width={120}
            />
            <Bar dataKey="range" layout="vertical" radius={4}>
              <LabelList
                className="fill-foreground"
                dataKey="value"
                fontSize={12}
                offset={2}
                position="right"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};
