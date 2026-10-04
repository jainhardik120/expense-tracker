'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { Column } from '@/lib/table';
import { cn } from '@/lib/utils';

import type { RowData } from '@tanstack/react-table';

export const DataTableColumnHeader = <TData extends RowData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}) => {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();
  const SORT_ICONS = { asc: ArrowUp, desc: ArrowDown } as const;
  const SortIcon = sorted === false ? ChevronsUpDown : SORT_ICONS[sorted];
  const sortLabel = sorted === false ? 'unsorted' : `${sorted}ending`;
  const alignsRight = column.columnDef.meta?.align === 'right';

  return (
    <Button
      aria-label={`Sort by ${title}, currently ${sortLabel}`}
      className={cn('h-8 gap-1 px-2 font-medium', alignsRight ? '-mr-2' : '-ml-2', className)}
      size="sm"
      variant="ghost"
      onClick={column.getToggleSortingHandler()}
    >
      {title}
      <SortIcon className={cn('size-3.5', sorted === false && 'text-muted-foreground/50')} />
    </Button>
  );
};
