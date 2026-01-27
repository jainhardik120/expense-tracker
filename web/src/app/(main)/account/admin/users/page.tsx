import { createLoader, type SearchParams } from 'nuqs/server';

import { HydrateClient, prefetch } from '@/server/server';
import { pageParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(pageParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const pageParams = await loader(searchParams);
  prefetch((trpc) => trpc.admin.getUsers.queryOptions({ ...pageParams }));
  return (
    <HydrateClient>
      <Table />
    </HydrateClient>
  );
}
