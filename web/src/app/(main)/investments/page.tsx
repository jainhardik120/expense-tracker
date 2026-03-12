import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { investmentParser } from '@/types';

import Table from './_components/table';

export const metadata = {
  title: 'Investments',
  description: 'Track portfolio value, profit/loss, and investment trends.',
};

const loader = createLoader(investmentParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const pageParams = await loader(searchParams);
  const data = await api.investments.getInvestmentsPageData({
    ...pageParams,
    start: pageParams.date[0],
    end: pageParams.date[1],
  });

  return (
    <Table
      data={data}
      filters={{
        start: pageParams.date[0],
        end: pageParams.date[1],
        investmentKind: pageParams.investmentKind,
      }}
    />
  );
}
