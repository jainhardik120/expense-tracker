import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { emiParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(emiParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const pageParams = await loader(searchParams);
  const data = await api.emis.getEmis({
    ...pageParams,
    completed: pageParams.completed ?? undefined,
  });
  const creditCards = await api.accounts.getCreditCards();
  return (
    <>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <Table creditCards={creditCards} data={data} />
    </>
  );
}
