'use client';

import { useState } from 'react';

import { Loader2, Pencil, X } from 'lucide-react';

import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { EditableTable } from '@/components/editable-table/editable-table';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { useEditableTable } from '@/hooks/use-editable-table';
import { api } from '@/server/react';
import type { RouterOutput } from '@/server/routers';
import { type Account, type Friend } from '@/types';

import { BulkImportGrid } from './bulk-import-grid';
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

/** How tall the rows area is allowed to grow before it scrolls internally. */
const GRID_HEIGHT = 560;

/**
 * The messages, and the same messages being entered.
 *
 * Entering the queue used to mean a second page with a second table on it.
 * The two are the same work seen twice, so they are one table here: reading is
 * the table with its editors switched off, and entering is the table with them
 * switched on. Nothing navigates, and the frame around the rows -- toolbar,
 * border, action bar -- is the same object in both.
 */
export default function SmsNotificationsTable({
  data,
  accountsData,
  friendsData,
  categories,
  estimate,
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

  // The list keeps its sorting, filters and page in the URL, and goes on owning
  // them while the grid draws the rows.
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
    state: table.getState(),
    onSortingChange: table.setSorting,
    onColumnFiltersChange: table.setColumnFilters,
    onRowSelectionChange: table.setRowSelection,
    onPaginationChange: table.setPagination,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: data.pageCount,
  });

  // Only asked for once the user actually wants to enter anything.
  const queue = api.smsNotifications.getBulkImportRows.useQuery(undefined, {
    enabled: mode === 'edit',
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            Every pending message, filled in from how messages like it were filed before. Correct
            anything that looks wrong, untick what should not go in, then enter the rest at once.
          </p>
          {modeButton}
        </div>
        {queue.isPending ? (
          <div className="text-muted-foreground flex h-24 items-center justify-center rounded-md border text-sm">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Reading the queue…
          </div>
        ) : (
          <BulkImportGrid
            // Keyed on the queue itself: once an import changes what is pending
            // the editor starts again from the new rows, rather than holding
            // edits to rows that no longer exist.
            key={(queue.data?.rows ?? []).map((row) => row.id).join(',')}
            accounts={accountsData}
            categories={categories}
            friends={friendsData}
            initialRows={queue.data?.rows ?? []}
            tags={queue.data?.tagOptions ?? []}
            onImported={() => {
              setMode('view');
            }}
          />
        )}
      </div>
    );
  }

  return (
    <EditableTable {...view} height={GRID_HEIGHT} stretchColumns>
      <DataTableToolbar table={table}>{modeButton}</DataTableToolbar>
    </EditableTable>
  );
}
