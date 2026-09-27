import Link from 'next/link';

import { Rows3 } from 'lucide-react';
import { createLoader, type SearchParams } from 'nuqs/server';

import { Button } from '@/components/ui/button';
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
  const data = await api.smsNotifications.list(queryParams);
  const accounts = await api.accounts.getAccounts();
  const friends = await api.friends.getFriends();
  const categories = await api.statements.getCategories({});
  const estimate = await api.smsNotifications.getPendingEstimate();
  return (
    <div className="flex flex-col gap-4">
      <PendingEstimate estimate={estimate} />
      {estimate.count > 0 ? (
        <Button asChild className="w-fit" variant="outline">
          <Link href="/sms-notifications/bulk-import">
            <Rows3 className="size-4" />
            Bulk import {estimate.count} pending
          </Link>
        </Button>
      ) : null}
      <Table accountsData={accounts} categories={categories} data={data} friendsData={friends} />
    </div>
  );
}
