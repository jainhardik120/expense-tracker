import { Suspense } from 'react';

import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { aggregationParser } from '@/types';

import Expenses from './_components/expenses';
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
      <Table data={data.processedAggregations} unit={params.period} />
      <div className="grid grid-cols-3">
        <Expenses
          data={data.processedAggregations.map((agg) => ({
            date: agg.date,
            expenses: agg.totalExpenses,
          }))}
          unit={params.period}
        />
      </div>
    </div>
  );
}
