import { Suspense } from 'react';

import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { aggregationParser } from '@/types';

import AggregationTable from './_components/aggregation-table';
import { CategoryExpensesPieChart, ExpensesLineChart, SummaryCard } from './_components/charts';
import FilterPanel from './_components/filter-panel';
import SummaryTable from './_components/summary-table';

const loader = createLoader(aggregationParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const params = await loader(searchParams);
  const aggregationData = await api.summary.getAggregatedData({
    aggregateBy: params.period,
    start: params.start,
    end: params.end,
  });
  const summaryData = await api.summary.getSummary({ start: params.start, end: params.end });
  return (
    <div className="flex flex-col gap-4">
      <Suspense>
        <FilterPanel />
      </Suspense>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ExpensesLineChart
          allCategories={Object.entries(aggregationData.categoryWiseTotals)
            .filter(([_, amount]) => amount > 0)
            .map(([category]) => category)}
          data={aggregationData.periodAggregations.map((agg) => ({
            ...agg,
            expenses: agg.totalExpenses,
          }))}
          range={params}
          unit={params.period}
        />
        <CategoryExpensesPieChart
          data={Object.entries(aggregationData.categoryWiseTotals)
            .filter(([_, amount]) => amount > 0)
            .map(([category, amount]) => ({
              category,
              amount,
            }))}
          range={params}
        />
        <SummaryCard data={summaryData} />
      </div>
      <SummaryTable data={summaryData} />
      <AggregationTable data={aggregationData.periodAggregations} unit={params.period} />
    </div>
  );
}
