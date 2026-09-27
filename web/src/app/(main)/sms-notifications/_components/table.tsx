'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Rows3 } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import type { RouterOutput } from '@/server/routers';
import { type Account, type Friend } from '@/types';

import { createSmsNotificationColumns } from './sms-notification-columns';

type Estimate = RouterOutput['smsNotifications']['getPendingEstimate'];

type SmsNotificationsData = RouterOutput['smsNotifications']['list'];
type SmsNotificationsTableProps = Readonly<{
  data: SmsNotificationsData;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  estimate: Estimate;
}>;

export default function SmsNotificationsTable({
  data,
  accountsData,
  friendsData,
  categories,
  estimate,
}: SmsNotificationsTableProps) {
  const router = useRouter();

  const columns = createSmsNotificationColumns({
    onRefresh: () => {
      router.refresh();
    },
    accountsData,
    friendsData,
    categories,
  });

  const { table } = useDataTable({
    data: data.notifications,
    columns,
    pageCount: data.pageCount,
    shallow: false,
  });

  return (
    <DataTable getItemValue={(item) => item.id} table={table}>
      <DataTableToolbar table={table}>
        {estimate.count > 0 ? (
          <Button asChild className="w-fit" size="sm" variant="outline">
            <Link href="/sms-notifications/bulk-import">
              <Rows3 className="size-4" />
              Bulk import {estimate.count} pending
            </Link>
          </Button>
        ) : null}
      </DataTableToolbar>
    </DataTable>
  );
}
