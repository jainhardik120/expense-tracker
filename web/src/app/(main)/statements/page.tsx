import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { statementParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(statementParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const pageParams = await loader(searchParams);
  const queryParams = {
    ...pageParams,
    start: pageParams.date[0],
    end: pageParams.date[1],
  };
  const data = await api.statements.getStatements(queryParams);
  const friends = await api.friends.getFriends();
  const accounts = await api.accounts.getAccounts();
  const categories = await api.statements.getCategories(queryParams);
  const tags = await api.statements.getTags(queryParams);
  const creditAccounts = await api.accounts.getCreditCards();
  return (
    <Table
      accountsData={accounts}
      categories={categories}
      creditAccounts={creditAccounts}
      data={data}
      friendsData={friends}
      tags={tags}
    />
  );
}
