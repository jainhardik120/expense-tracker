'use client';

import { type Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A column heading that sorts when clicked, cycling ascending, descending, off.
 *
 * Columns that cannot be sorted render as plain text rather than a dead button,
 * so the ones that do something look different from the ones that do not.
 */
export const DataTableColumnHeader = <TData, TValue>({
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

  return (
    <Button
      aria-label={`Sort by ${title}, currently ${sortLabel}`}
      className={cn('-ml-2 h-8 gap-1 px-2 font-medium', className)}
      size="sm"
      variant="ghost"
      onClick={column.getToggleSortingHandler()}
    >
      {title}
      <SortIcon className={cn('size-3.5', sorted === false && 'text-muted-foreground/50')} />
    </Button>
  );
};
