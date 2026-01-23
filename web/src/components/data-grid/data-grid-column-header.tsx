'use client';

import * as React from 'react';

import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeOffIcon,
  PinIcon,
  PinOffIcon,
  XIcon,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getColumnVariant } from '@/lib/data-grid';
import { cn } from '@/lib/utils';

import type { ColumnSort, Header, SortDirection, SortingState, Table } from '@tanstack/react-table';

interface DataGridColumnHeaderProps<TData, TValue> extends React.ComponentProps<
  typeof DropdownMenuTrigger
> {
  header: Header<TData, TValue>;
  table: Table<TData>;
}

export const DataGridColumnHeader = <TData, TValue>({
  header,
  table,
  className,
  onPointerDown,
  ...props
}: DataGridColumnHeaderProps<TData, TValue>) => {
  const { column } = header;
  const label = column.columnDef.meta?.label
    ? column.columnDef.meta.label
    : typeof column.columnDef.header === 'string'
      ? column.columnDef.header
      : column.id;

  const isAnyColumnResizing = table.getState().columnSizingInfo.isResizingColumn;

  const cellVariant = column.columnDef.meta?.cell;
  const columnVariant = getColumnVariant(cellVariant?.variant);

  const pinnedPosition = column.getIsPinned();
  const isPinnedLeft = pinnedPosition === 'left';
  const isPinnedRight = pinnedPosition === 'right';

  const onSortingChange = React.useCallback(
    (direction: SortDirection) => {
      table.setSorting((prev: SortingState) => {
        const existingSortIndex = prev.findIndex((sort) => sort.id === column.id);
        const newSort: ColumnSort = {
          id: column.id,
          desc: direction === 'desc',
        };

        if (existingSortIndex >= 0) {
          const updated = [...prev];
          updated[existingSortIndex] = newSort;
          return updated;
        }
        return [...prev, newSort];
      });
    },
    [column.id, table],
  );

  const onSortRemove = React.useCallback(() => {
    table.setSorting((prev: SortingState) => prev.filter((sort) => sort.id !== column.id));
  }, [column.id, table]);

  const onLeftPin = React.useCallback(() => {
    column.pin('left');
  }, [column]);

  const onRightPin = React.useCallback(() => {
    column.pin('right');
  }, [column]);

  const onUnpin = React.useCallback(() => {
    column.pin(false);
  }, [column]);

  const onTriggerPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event);
      if (event.defaultPrevented) {
        return;
      }

      if (event.button !== 0) {
        return;
      }
      table.options.meta?.onColumnClick?.(column.id);
    },
    [table.options.meta, column.id, onPointerDown],
  );

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          className={cn(
            'hover:bg-accent/40 data-[state=open]:bg-accent/40 flex size-full items-center justify-between gap-2 p-2 text-sm [&_svg]:size-4',
            isAnyColumnResizing && 'pointer-events-none',
            className,
          )}
          onPointerDown={onTriggerPointerDown}
          {...props}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {columnVariant ? (
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <columnVariant.icon className="text-muted-foreground size-3.5 shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{columnVariant.label}</p>
                </TooltipContent>
              </Tooltip>
            ) : null}
            <span className="truncate">{label}</span>
          </div>
          <ChevronDownIcon className="text-muted-foreground shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60" sideOffset={0}>
          {column.getCanSort() && (
            <>
              <DropdownMenuCheckboxItem
                checked={column.getIsSorted() === 'asc'}
                className="[&_svg]:text-muted-foreground relative ltr:pr-8 ltr:pl-2 rtl:pr-2 rtl:pl-8 [&>span:first-child]:ltr:right-2 [&>span:first-child]:ltr:left-auto [&>span:first-child]:rtl:right-auto [&>span:first-child]:rtl:left-2"
                onSelect={() => {
                  onSortingChange('asc');
                }}
              >
                <ChevronUpIcon />
                Sort asc
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={column.getIsSorted() === 'desc'}
                className="[&_svg]:text-muted-foreground relative ltr:pr-8 ltr:pl-2 rtl:pr-2 rtl:pl-8 [&>span:first-child]:ltr:right-2 [&>span:first-child]:ltr:left-auto [&>span:first-child]:rtl:right-auto [&>span:first-child]:rtl:left-2"
                onSelect={() => {
                  onSortingChange('desc');
                }}
              >
                <ChevronDownIcon />
                Sort desc
              </DropdownMenuCheckboxItem>
              {column.getIsSorted() && (
                <DropdownMenuItem onSelect={onSortRemove}>
                  <XIcon />
                  Remove sort
                </DropdownMenuItem>
              )}
            </>
          )}
          {column.getCanPin() && (
            <>
              {column.getCanSort() && <DropdownMenuSeparator />}

              {isPinnedLeft ? (
                <DropdownMenuItem className="[&_svg]:text-muted-foreground" onSelect={onUnpin}>
                  <PinOffIcon />
                  Unpin from left
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="[&_svg]:text-muted-foreground" onSelect={onLeftPin}>
                  <PinIcon />
                  Pin to left
                </DropdownMenuItem>
              )}
              {isPinnedRight ? (
                <DropdownMenuItem className="[&_svg]:text-muted-foreground" onSelect={onUnpin}>
                  <PinOffIcon />
                  Unpin from right
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="[&_svg]:text-muted-foreground" onSelect={onRightPin}>
                  <PinIcon />
                  Pin to right
                </DropdownMenuItem>
              )}
            </>
          )}
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="[&_svg]:text-muted-foreground"
                onSelect={() => {
                  column.toggleVisibility(false);
                }}
              >
                <EyeOffIcon />
                Hide column
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {header.column.getCanResize() && (
        <DataGridColumnResizer header={header} label={label} table={table} />
      )}
    </>
  );
};

interface DataGridColumnResizerProps<TData, TValue> extends DataGridColumnHeaderProps<
  TData,
  TValue
> {
  label: string;
}

const DataGridColumnResizerImpl = <TData, TValue>({
  header,
  table,
  label,
}: DataGridColumnResizerProps<TData, TValue>) => {
  const defaultColumnDef = table._getDefaultColumnDef();

  const onDoubleClick = React.useCallback(() => {
    header.column.resetSize();
  }, [header.column]);

  return (
    <div
      aria-label={`Resize ${label} column`}
      aria-orientation="vertical"
      aria-valuemax={defaultColumnDef.maxSize}
      aria-valuemin={defaultColumnDef.minSize}
      aria-valuenow={header.column.getSize()}
      className={cn(
        "bg-border hover:bg-primary focus:bg-primary absolute -end-px top-0 z-50 h-full w-0.5 cursor-ew-resize touch-none transition-opacity select-none after:absolute after:inset-y-0 after:start-1/2 after:h-full after:w-[18px] after:-translate-x-1/2 after:content-[''] focus:outline-none",
        header.column.getIsResizing() ? 'bg-primary' : 'opacity-0 hover:opacity-100',
      )}
      role="separator"
      tabIndex={0}
      onDoubleClick={onDoubleClick}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
    />
  );
};

const DataGridColumnResizer = React.memo(DataGridColumnResizerImpl, (prev, next) => {
  const prevColumn = prev.header.column;
  const nextColumn = next.header.column;

  if (
    prevColumn.getIsResizing() !== nextColumn.getIsResizing() ||
    prevColumn.getSize() !== nextColumn.getSize()
  ) {
    return false;
  }

  if (prev.label !== next.label) {
    return false;
  }

  return true;
}) as typeof DataGridColumnResizerImpl;
