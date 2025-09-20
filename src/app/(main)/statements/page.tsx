import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { statementParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(statementParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const pageParams = await loader(searchParams);
  const data = await api.statements.getStatements({
    ...pageParams,
    start: pageParams.date[0],
    end: pageParams.date[1],
  });
  const friends = await api.friends.getFriends();
  const accounts = await api.accounts.getAccounts();
  return <Table accountsData={accounts} data={data} friendsData={friends} />;
}
