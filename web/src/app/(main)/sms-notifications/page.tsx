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
  // Together rather than one after another: none of them depends on another's
  // answer, and read sequentially they cost the sum of six round trips.
  //
  // The queue is read here even though nothing shows it yet. It is what the
  // table switches to when the user starts entering, and fetching it at that
  // moment meant a wait with nothing to look at -- while fetching it alongside
  // the rest costs no wall clock at all, since it lands with everything else.
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
