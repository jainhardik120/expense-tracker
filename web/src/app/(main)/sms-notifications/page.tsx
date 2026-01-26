import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { smsNotificationParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(smsNotificationParser);

export default async function SmsNotificationsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const pageParams = await loader(searchParams);
  const queryParams = {
    ...pageParams,
    start: pageParams.date[0],
    end: pageParams.date[1],
  };
  const data = await api.smsNotifications.list(queryParams);
  const accounts = await api.accounts.getAccounts();
  const friends = await api.friends.getFriends();
  const categories = await api.statements.getCategories({});
  return (
    <Table accountsData={accounts} categories={categories} data={data} friendsData={friends} />
  );
}
