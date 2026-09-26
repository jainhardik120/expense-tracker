import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createLoader, type SearchParams } from 'nuqs/server';

import { pageSizeCookieName, parsePageSize, STATEMENTS_PAGE_SIZE_KEY } from '@/lib/page-size';
import { api } from '@/server/server';
import { statementParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(statementParser);

/**
 * Send an unparameterised visit to the size last chosen, before rendering.
 *
 * Only when the URL says nothing: a link carrying ?perPage opens at the size it
 * names, whoever follows it.
 */
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
  };
  const data = await api.statements.getStatements(queryParams);
  const friends = await api.friends.getFriends();
  const accounts = await api.accounts.getAccounts();
  const categories = await api.statements.getCategories(queryParams);
  const tags = await api.statements.getTags(queryParams);
  return (
    <Table
      accountsData={accounts}
      categories={categories}
      data={data}
      friendsData={friends}
      tags={tags}
    />
  );
}
