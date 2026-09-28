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

import { BulkImportGrid } from './bulk-import-grid';
import { createSmsNotificationColumns } from './sms-notification-columns';

type Estimate = RouterOutput['smsNotifications']['getPendingEstimate'];

type SmsNotificationsData = RouterOutput['smsNotifications']['list'];
type Queue = RouterOutput['smsNotifications']['getBulkImportRows'];
type SmsNotificationsTableProps = Readonly<{
  data: SmsNotificationsData;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  estimate: Estimate;
  /** The pending queue, read on the server so entering is instant. */
  initialQueue: Queue;
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

  // Seeded from the server, so switching to entering shows the rows straight
  // away. A background refetch may still run, but there is never a moment with
  // nothing to show -- which is what a spinner in place of the whole table was.
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
        {/* Laid out like the toolbar it replaces -- one row, same height, the
            mode button in the same place -- so the grid below it does not move
            when the mode changes. */}
        <div className="flex h-8 items-center justify-between gap-2">
          <p className="text-muted-foreground truncate text-sm">
            Filled in from how messages like these were filed before. Correct anything wrong, untick
            what should stay out, then enter the rest at once.
          </p>
          {modeButton}
        </div>
        <BulkImportGrid
          // Keyed on the queue itself: once an import changes what is pending
          // the editor starts again from the new rows, rather than holding
          // edits to rows that no longer exist.
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
