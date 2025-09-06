'use client';

import { useQueryStates } from 'nuqs';

import DateInput from '@/components/date-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/server/react';
import { DateTruncValues } from '@/types';
import { aggregationParser } from '@/types/aggregationParser';

import { Expenses } from './_components/expenses';
import Table from './_components/table';

export default function Page() {
  const [params, setParams] = useQueryStates(aggregationParser);
  const { data } = api.summary.getAggregatedData.useQuery({
    aggregateBy: params.period,
    start: params.start,
    end: params.end,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Period:</span>
          <Select value={params.period} onValueChange={(value) => setParams({ period: value })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DateTruncValues.map((period) => (
                <SelectItem key={period} value={period}>
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Start Date:</span>
          <DateInput date={params.start} onChange={(date) => setParams({ start: date })} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">End Date:</span>
          <DateInput date={params.end} onChange={(date) => setParams({ end: date })} />
        </div>
      </div>

      <Table data={data?.processedAggregations ?? []} unit={params.period} />
      <div className="grid grid-cols-3">
        <Expenses
          data={(data?.processedAggregations ?? []).map((agg) => ({
            date: agg.date,
            expenses: agg.totalExpenses,
          }))}
          unit={params.period}
        />
      </div>
    </div>
  );
}
