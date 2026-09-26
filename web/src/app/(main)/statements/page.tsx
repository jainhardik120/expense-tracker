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
  // Independent of each other, so they run together rather than in a chain --
  // the facet counts alone are four grouped queries.
  const [data, friends, accounts, categories, tags, facetCounts] = await Promise.all([
    api.statements.getStatements(queryParams),
    api.friends.getFriends(),
    api.accounts.getAccounts(),
    // Unfiltered: these feed the create and edit forms, which must offer every
    // category and tag that exists, not just the ones the current filter admits.
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
