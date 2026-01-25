'use client';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import type { RouterOutput } from '@/server/routers';
import { type Account, type Friend } from '@/types';

import { createSmsNotificationColumns } from './sms-notification-columns';

type SmsNotificationsData = RouterOutput['smsNotifications']['list'];
type SmsNotificationsTableProps = Readonly<{
  data: SmsNotificationsData;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}>;

export default function SmsNotificationsTable({
  data,
  accountsData,
  friendsData,
  categories,
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
      <DataTableToolbar table={table} />
    </DataTable>
  );
}
