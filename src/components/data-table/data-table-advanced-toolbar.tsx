'use client';

import type * as React from 'react';

import { DataTableViewOptions } from '@/components/data-table/data-table-view-options';
import { cn } from '@/lib/utils';

import type { Table } from '@tanstack/react-table';

interface DataTableAdvancedToolbarProps<TData> extends React.ComponentProps<'div'> {
  table: Table<TData>;
}

export const DataTableAdvancedToolbar = <TData,>({
  table,
  children,
  className,
  ...props
}: DataTableAdvancedToolbarProps<TData>) => (
  <div
    aria-orientation="horizontal"
    className={cn('flex w-full items-start justify-between gap-2 p-1', className)}
    role="toolbar"
    {...props}
  >
    <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
    <div className="flex items-center gap-2">
      <DataTableViewOptions table={table} />
    </div>
  </div>
);
