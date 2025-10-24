import { Suspense } from 'react';

import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { aggregationParser } from '@/types';

import { CategoryExpensesPieChart, ExpensesLineChart } from './_components/charts';
import FilterPanel from './_components/filter-panel';
import Table from './_components/table';

const loader = createLoader(aggregationParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const params = await loader(searchParams);
  const data = await api.summary.getAggregatedData({
    aggregateBy: params.period,
    start: params.start,
    end: params.end,
  });
  return (
    <div className="flex flex-col gap-4">
      <Suspense>
        <FilterPanel />
      </Suspense>
      <Table data={data.periodAggregations} unit={params.period} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ExpensesLineChart
          allCategories={Object.entries(data.categoryWiseTotals)
            .filter(([_, amount]) => amount > 0)
            .map(([category]) => category)}
          data={data.periodAggregations.map((agg) => ({
            ...agg,
            expenses: agg.totalExpenses,
          }))}
          range={params}
          unit={params.period}
        />
        <CategoryExpensesPieChart
          data={Object.entries(data.categoryWiseTotals)
            .filter(([_, amount]) => amount > 0)
            .map(([category, amount]) => ({
              category,
              amount,
            }))}
        />
      </div>
    </div>
  );
}
