import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { friendInboxParser } from '@/types';

import InboxTable from './_components/inbox-table';
import InvitationsCard from './_components/invitations-card';

const loader = createLoader(friendInboxParser);

export default async function FriendsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const params = await loader(searchParams);
  const [data, accounts, friends, categories] = await Promise.all([
    api.friends.getInbox({ ...params, start: params.date[0], end: params.date[1] }),
    api.accounts.getAccounts(),
    api.friends.getFriends(),
    api.statements.getCategories({}),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <InvitationsCard />
      <InboxTable
        accountsData={accounts}
        categories={categories}
        data={data}
        friendsData={friends}
      />
    </div>
  );
}
