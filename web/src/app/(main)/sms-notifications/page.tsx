import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { smsNotificationParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(smsNotificationParser);

export default async function SmsNotificationsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const pageParams = await loader(searchParams);
  const data = await api.smsNotifications.list({
    ...pageParams,
    timestampFrom: pageParams.timestampFrom ?? undefined,
    timestampTo: pageParams.timestampTo ?? undefined,
  });
  const accounts = await api.accounts.getAccounts();
  const friends = await api.friends.getFriends();
  const categories = await api.statements.getCategories({});
  return (
    <Table accountsData={accounts} categories={categories} data={data} friendsData={friends} />
  );
}
