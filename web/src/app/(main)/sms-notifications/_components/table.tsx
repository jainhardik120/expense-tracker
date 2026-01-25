'use client';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import type { RouterOutput } from '@/server/routers';

import { createSmsNotificationColumns } from './sms-notification-columns';

type SmsNotificationsData = RouterOutput['smsNotifications']['list'];
type SmsNotificationsTableProps = Readonly<{
  data: SmsNotificationsData;
}>;

export default function SmsNotificationsTable({ data }: SmsNotificationsTableProps) {
  const columns = createSmsNotificationColumns();

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
