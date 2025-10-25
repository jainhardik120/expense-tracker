'use client';

import { useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import LineChart from '@/components/line-chart';
import PieChart from '@/components/pie-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatTruncatedDate } from '@/lib/date';
import type {
  AccountSummary,
  AggregatedAccountTransferSummary,
  AggregatedFriendTransferSummary,
  DateRange,
  DateTruncUnit,
  FriendSummary,
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
        date: formatTruncatedDate(d.date, unit),
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
  }, [data, selectedCategories, unit]);

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
          From: {formatTruncatedDate(range.start, unit)} To: {formatTruncatedDate(range.end, unit)}
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
          innerRadius={60}
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

export const SummaryCard = ({
  data: summaryData,
}: {
  data: {
    accountsSummaryData: AccountSummary[];
    friendsSummaryData: FriendSummary[];
    myExpensesTotal: number;
    aggregatedAccountsSummaryData: AggregatedAccountTransferSummary;
    aggregatedFriendsSummaryData: AggregatedFriendTransferSummary;
  };
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Summary</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-2">
        <p>Accounts Balance: {summaryData.aggregatedAccountsSummaryData.finalBalance.toFixed(2)}</p>
        <p>Friend Balance: {summaryData.aggregatedFriendsSummaryData.finalBalance.toFixed(2)}</p>
        <p>My Expenses: {summaryData.myExpensesTotal.toFixed(2)}</p>
        <p>
          My Balance:{' '}
          {(
            summaryData.aggregatedAccountsSummaryData.finalBalance -
            summaryData.aggregatedFriendsSummaryData.finalBalance
          ).toFixed(2)}
        </p>
      </div>
    </CardContent>
  </Card>
);
