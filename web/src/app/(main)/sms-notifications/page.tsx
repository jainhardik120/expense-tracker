import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { smsNotificationParser } from '@/types';

import { PendingEstimate } from './_components/pending-estimate';
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
  const [data, accounts, friends, categories, estimate, queue] = await Promise.all([
    api.smsNotifications.list(queryParams),
    api.accounts.getAccounts(),
    api.friends.getFriends(),
    api.statements.getCategories({}),
    api.smsNotifications.getPendingEstimate(),
    api.smsNotifications.getBulkImportRows(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PendingEstimate estimate={estimate} />
      <Table
        accountsData={accounts}
        categories={categories}
        data={data}
        estimate={estimate}
        friendsData={friends}
        initialQueue={queue}
      />
    </div>
  );
}
