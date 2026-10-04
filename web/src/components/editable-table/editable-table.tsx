'use client';

import type * as React from 'react';

import { DataGrid } from '@/components/data-grid/data-grid';
import { DataTablePagination } from '@/components/data-table/data-table-pagination';
import type { useEditableTable } from '@/hooks/use-editable-table';
import { cn } from '@/lib/utils';

import type { RowData } from '@tanstack/react-table';

type DataGridOwnProps = Pick<
  React.ComponentProps<typeof DataGrid>,
  'height' | 'fill' | 'stretchColumns' | 'emptyState' | 'dir'
>;

type EditableTableProps<TData extends RowData> = ReturnType<typeof useEditableTable<TData>> &
  DataGridOwnProps & {
    className?: string;
    children?: React.ReactNode;
    actionBar?: React.ReactNode;
    enablePagination?: boolean;
    enableSelection?: boolean;
  };

export const EditableTable = <TData extends RowData>({
  children,
  actionBar,
  enablePagination = true,
  enableSelection = true,
  className,
  mode,
  ...grid
}: EditableTableProps<TData>) => {
  const { table, fill = false } = grid;
  const hasSelectedRows = table.getFilteredSelectedRowModel().rows.length > 0;

  return (
    <div className={cn('flex w-full flex-col gap-2.5', fill && 'min-h-0 flex-1', className)}>
      {fill ? <div className="shrink-0">{children}</div> : children}
      <DataGrid<TData> {...grid} data-mode={mode} />
      {enablePagination || (actionBar !== undefined && hasSelectedRows) ? (
        <div className={cn('flex flex-col gap-2.5', fill && 'shrink-0')}>
          {enablePagination ? (
            <DataTablePagination enableSelection={enableSelection} table={table} />
          ) : null}
          {actionBar !== undefined && hasSelectedRows ? actionBar : null}
        </div>
      ) : null}
    </div>
  );
};
