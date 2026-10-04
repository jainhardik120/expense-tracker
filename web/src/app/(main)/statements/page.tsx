import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createLoader, type SearchParams } from 'nuqs/server';

import { pageSizeCookieName, parsePageSize, STATEMENTS_PAGE_SIZE_KEY } from '@/lib/page-size';
import { api } from '@/server/server';
import { statementParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(statementParser);

const redirectToStoredPageSize = async (raw: SearchParams) => {
  if (raw['perPage'] !== undefined) {
    return;
  }
  const stored = parsePageSize(
    (await cookies()).get(pageSizeCookieName(STATEMENTS_PAGE_SIZE_KEY))?.value,
  );
  if (stored === null) {
    return;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      params.set(key, value.join(','));
    }
  }
  params.set('perPage', String(stored));
  redirect(`/statements?${params.toString()}`);
};

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  await redirectToStoredPageSize(await searchParams);
  const pageParams = await loader(searchParams);
  const queryParams = {
    ...pageParams,
    start: pageParams.date[0],
    end: pageParams.date[1],
    sort: JSON.stringify(pageParams.sort),
  };
  const [data, friends, accounts, categories, tags, facetCounts] = await Promise.all([
    api.statements.getStatements(queryParams),
    api.friends.getFriends(),
    api.accounts.getAccounts(),
    api.statements.getCategories({}),
    api.statements.getTags({}),
    api.statements.getFacetCounts(queryParams),
  ]);
  return (
    <Table
      accountsData={accounts}
      categories={categories}
      data={data}
      facetCounts={facetCounts}
      friendsData={friends}
      tags={tags}
    />
  );
}
