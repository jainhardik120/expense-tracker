'use client';

import { useState } from 'react';

import { Pencil, X } from 'lucide-react';

import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { EditableTable } from '@/components/editable-table/editable-table';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { useEditableTable } from '@/hooks/use-editable-table';
import { api } from '@/server/react';
import type { RouterOutput } from '@/server/routers';
import { type Account, type Friend } from '@/types';
import type { PendingSmsEstimate } from '@/types/router-outputs';

import { BulkImportGrid } from './bulk-import-grid';
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

const GRID_HEIGHT = 560;

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

  const view = useEditableTable({
    mode: 'view',
    data: data.notifications,
    columns,
    getRowId: (row) => row.id,
    state: table.state,
    onSortingChange: table.setSorting,
    onColumnFiltersChange: table.setColumnFilters,
    onRowSelectionChange: table.setRowSelection,
    onPaginationChange: table.setPagination,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: data.pageCount,
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
      <div className="flex w-full flex-col gap-2.5">
        <div className="flex h-8 items-center justify-between gap-2">
          <p className="text-muted-foreground truncate text-sm">
            Filled in from how messages like these were filed before. Correct anything wrong, untick
            what should stay out, then enter the rest at once.
          </p>
          {modeButton}
        </div>
        <BulkImportGrid
          key={queue.data.rows.map((row) => row.id).join(',')}
          accounts={accountsData}
          categories={categories}
          friends={friendsData}
          initialRows={queue.data.rows}
          tags={queue.data.tagOptions}
          onImported={() => {
            void utils.smsNotifications.getBulkImportRows.invalidate();
            setMode('view');
          }}
        />
      </div>
    );
  }

  return (
    <EditableTable {...view} height={GRID_HEIGHT} stretchColumns="last">
      <DataTableToolbar table={table}>{modeButton}</DataTableToolbar>
    </EditableTable>
  );
}
