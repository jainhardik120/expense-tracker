import { createLoader, type SearchParams } from 'nuqs/server';

import DateFilter from '@/components/date-filter';
import { api } from '@/server/server';
import { dateParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(dateParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const params = await loader(searchParams);

  const data = await api.summary.getSummary(params);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-md border p-2">
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
      </div>
      <div className="flex gap-4">
        <DateFilter />
      </div>
      <Table data={data} />
    </div>
  );
}
