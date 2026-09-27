'use client';

import type * as React from 'react';

import { DataGrid } from '@/components/data-grid/data-grid';
import { DataTablePagination } from '@/components/data-table/data-table-pagination';
import type { useEditableTable } from '@/hooks/use-editable-table';
import { cn } from '@/lib/utils';

/**
 * A table that can be edited in place.
 *
 * It is a `DataGrid` in both modes, which is the point: switching between
 * reading and editing does not remount anything, does not re-measure the
 * columns and does not move a single row. The cell under the pointer when the
 * switch is thrown is the cell that opens.
 *
 * The chrome is shared with `DataTable` rather than rebuilt -- the toolbar,
 * pagination, view options and action bar all take nothing but a TanStack
 * table instance, so they neither know nor care which of the two is drawing
 * the rows.
 */
type DataGridOwnProps = Pick<
  React.ComponentProps<typeof DataGrid>,
  'height' | 'stretchColumns' | 'emptyState' | 'dir'
>;

type EditableTableProps<TData> = ReturnType<typeof useEditableTable<TData>> &
  DataGridOwnProps & {
    className?: string;
    /** Shown above the grid: a toolbar, filters, a mode switch. */
    children?: React.ReactNode;
    /** Shown below the grid once rows are selected. */
    actionBar?: React.ReactNode;
    enablePagination?: boolean;
    enableSelection?: boolean;
  };

export const EditableTable = <TData,>({
  children,
  actionBar,
  enablePagination = true,
  enableSelection = true,
  className,
  mode,
  ...grid
}: EditableTableProps<TData>) => {
  const { table } = grid;
  const hasSelectedRows = table.getFilteredSelectedRowModel().rows.length > 0;

  return (
    <div className={cn('flex w-full flex-col gap-2.5', className)}>
      {children}
      <DataGrid<TData> {...grid} data-mode={mode} />
      <div className="flex flex-col gap-2.5">
        {enablePagination ? (
          <DataTablePagination enableSelection={enableSelection} table={table} />
        ) : null}
        {actionBar !== undefined && hasSelectedRows ? actionBar : null}
      </div>
    </div>
  );
};
