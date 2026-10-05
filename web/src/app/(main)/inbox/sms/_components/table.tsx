'use client';

import { useState } from 'react';

import { Pencil, X } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { api } from '@/server/react';
import type { RouterOutput } from '@/server/routers';
import { type Account, type Friend } from '@/types';
import type { PendingSmsEstimate } from '@/types/router-outputs';

import { BulkImportTable } from './bulk-import-table';
import { createSmsNotificationColumns } from './sms-notification-columns';

type SmsNotificationsData = RouterOutput['smsNotifications']['list'];
type Queue = RouterOutput['smsNotifications']['getBulkImportRows'];
type SmsNotificationsTableProps = Readonly<{
  data: SmsNotificationsData;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  estimate: PendingSmsEstimate;
  initialQueue: Queue;
}>;

export default function SmsNotificationsTable({
  data,
  accountsData,
  friendsData,
  categories,
  estimate,
  initialQueue,
}: SmsNotificationsTableProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const columns = createSmsNotificationColumns({
    onRefresh: () => {
      globalThis.location.reload();
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

  const utils = api.useUtils();
  const queue = api.smsNotifications.getBulkImportRows.useQuery(undefined, {
    initialData: initialQueue,
  });

  const canEdit = estimate.count > 0;

  const modeButton =
    mode === 'view' ? (
      <Button
        className="w-fit"
        disabled={!canEdit}
        size="sm"
        title={canEdit ? undefined : 'Nothing is waiting to be entered'}
        variant="outline"
        onClick={() => {
          setMode('edit');
        }}
      >
        <Pencil className="size-4" />
        Enter {estimate.count} pending
      </Button>
    ) : (
      <Button
        className="w-fit"
        size="sm"
        variant="outline"
        onClick={() => {
          setMode('view');
        }}
      >
        <X className="size-4" />
        Done editing
      </Button>
    );

  if (mode === 'edit') {
    return (
      <BulkImportTable
        key={queue.data.rows.map((row) => row.id).join(',')}
        accounts={accountsData}
        categories={categories}
        friends={friendsData}
        initialRows={queue.data.rows}
        tags={queue.data.tagOptions}
        toolbar={modeButton}
        onImported={() => {
          void utils.smsNotifications.getBulkImportRows.invalidate();
          setMode('view');
        }}
      />
    );
  }

  return (
    <DataTable getItemValue={(item) => item.id} table={table}>
      <DataTableToolbar table={table}>{modeButton}</DataTableToolbar>
    </DataTable>
  );
}
