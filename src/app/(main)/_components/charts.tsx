'use client';

import { useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import LineChart from '@/components/line-chart';
import OverlayBar from '@/components/overlay-bar';
import PieChart from '@/components/pie-chart';
import { useTimezone } from '@/components/time-zone-setter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
      <CardContent>
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
  const a =
    data.aggregatedAccountsSummaryData.startingBalance -
    data.aggregatedFriendsSummaryData.startingBalance;
  const b = data.aggregatedAccountsSummaryData.startingBalance;
  const c = b + data.aggregatedAccountsSummaryData.outsideTransactions;
  const d =
    c +
    (data.aggregatedAccountsSummaryData.friendTransactions -
      data.aggregatedFriendsSummaryData.splits +
      data.aggregatedFriendsSummaryData.paidByFriend);
  const e = d - data.myExpensesTotal;
  const f = e - data.aggregatedFriendsSummaryData.finalBalance;
  const g =
    f -
    (data.aggregatedAccountsSummaryData.finalBalance -
      data.aggregatedFriendsSummaryData.finalBalance);
  return [
    {
      name: 'My Starting Balance',
      start: Math.min(0, a),
      end: Math.max(0, a),
      upDirection: a > 0,
      color: 'var(--chart-5)',
      label: 'My Starting Balance',
    },
    {
      name: 'Friend Starting Balance',
      start: Math.min(b, a),
      end: Math.max(b, a),
      upDirection: b > a,
      color: 'var(--chart-1)',
      label: 'Friend Starting Balance',
    },
    {
      name: 'Outside Transactions',
      start: Math.min(b, c),
      end: Math.max(b, c),
      upDirection: c > b,
      color: 'var(--chart-2)',
      label: 'Outside Transactions',
    },
    {
      name: 'Friend Transactions',
      start: Math.min(c, d),
      end: Math.max(c, d),
      upDirection: d > c,
      color: 'var(--chart-3)',
      label: 'Friend Transactions',
    },
    {
      name: 'Expenses',
      start: Math.min(e, d),
      end: Math.max(e, d),
      upDirection: e > d,
      color: 'var(--chart-4)',
      label: 'Expenses',
    },
    {
      name: 'Friend Balance',
      start: Math.min(e, f),
      end: Math.max(e, f),
      upDirection: data.aggregatedFriendsSummaryData.finalBalance > 0,
      color: 'var(--chart-5)',
      label: 'Friend Balance',
    },
    {
      name: 'My Balance',
      start: Math.min(f, g),
      end: Math.max(f, g),
      upDirection:
        data.aggregatedAccountsSummaryData.finalBalance -
          data.aggregatedFriendsSummaryData.finalBalance >
        0,
      color: 'var(--chart-1)',
      label: 'My Balance',
    },
  ];
};

export const SummaryCard = ({ data }: { data: SummaryData }) => {
  const overlayBarData = useMemo(() => constructOverlayBarData(data), [data]);
  return (
    <Card className="col-span-1 md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <OverlayBar data={overlayBarData} />
        <div className="grid grid-cols-2 gap-2">
          <p>Accounts Balance: {data.aggregatedAccountsSummaryData.finalBalance.toFixed(2)}</p>
          <p>Friend Balance: {data.aggregatedFriendsSummaryData.finalBalance.toFixed(2)}</p>
          <p>My Expenses: {data.myExpensesTotal.toFixed(2)}</p>
          <p>
            My Balance:{' '}
            {(
              data.aggregatedAccountsSummaryData.finalBalance -
              data.aggregatedFriendsSummaryData.finalBalance
            ).toFixed(2)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
