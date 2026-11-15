'use client';

import * as React from 'react';

import { type RowData } from '@tanstack/react-table';
import { Ellipsis, ListFilter, X } from 'lucide-react';

import { DataTableDateFilter } from '@/components/data-table/data-table-date-filter';
import { DataTableFacetedFilter } from '@/components/data-table/data-table-faceted-filter';
import { DataTableNumberFilter } from '@/components/data-table/data-table-number-filter';
import { DataTableSliderFilter } from '@/components/data-table/data-table-slider-filter';
import { DataTableViewOptions } from '@/components/data-table/data-table-view-options';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { Column, Table } from '@/lib/table';
import { cn } from '@/lib/utils';

import { getColumnLabel } from './column-label';

interface DataTableToolbarProps<TData extends RowData> extends Omit<
  React.ComponentProps<'div'>,
  'title'
> {
  table: Table<TData>;
  viewOptions?: boolean;
  title?: React.ReactNode;
}

const ToolbarSheet = ({
  label,
  icon,
  count,
  title,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  count?: number;
  title: string;
  children: React.ReactNode;
}) => (
  <Sheet>
    <SheetTrigger asChild>
      <Button className="md:hidden" size="sm" variant="outline">
        {icon}
        {label}
        {count === undefined || count === 0 ? null : (
          <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs tabular-nums">
            {count}
          </span>
        )}
      </Button>
    </SheetTrigger>
    <SheetContent className="max-h-[85svh] overflow-y-auto pb-6" side="bottom">
      <SheetHeader className="pb-0">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription className="sr-only">{title}</SheetDescription>
      </SheetHeader>
      {children}
    </SheetContent>
  </Sheet>
);

export const DataTableToolbar = <TData extends RowData>({
  table,
  children,
  className,
  viewOptions = true,
  title,
  ...props
}: DataTableToolbarProps<TData>) => {
  const isFiltered = table.state.columnFilters.length > 0;

  const allColumns = table.getAllColumns();
  const columns = React.useMemo(
    () => allColumns.filter((column) => column.getCanFilter()),
    [allColumns],
  );

  const onReset = React.useCallback(() => {
    table.resetColumnFilters();
  }, [table]);

  const actions = React.Children.toArray(children);
  const collapseActions = actions.length > 1;

  const filters = (
    <>
      {columns.map((column) => (
        <DataTableToolbarFilter key={column.id} column={column} />
      ))}
      {isFiltered ? (
        <Button
          aria-label="Reset filters"
          className="border-dashed"
          size="sm"
          variant="outline"
          onClick={onReset}
        >
          <X />
          Reset
        </Button>
      ) : null}
    </>
  );

  return (
    <div
      aria-orientation="horizontal"
      className={cn(
        'flex w-full justify-between gap-2',
        title === undefined ? 'items-start' : 'items-center',
        className,
      )}
      role="toolbar"
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {title === undefined ? null : <h2 className="min-w-0 font-semibold">{title}</h2>}
        <div className="hidden flex-wrap items-center gap-2 empty:hidden md:flex">{filters}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {columns.length === 0 ? null : (
          <ToolbarSheet
            count={table.state.columnFilters.length}
            icon={<ListFilter />}
            label="Filters"
            title="Filters"
          >
            <div className="flex flex-wrap items-center gap-2 px-4">{filters}</div>
          </ToolbarSheet>
        )}
        {collapseActions ? (
          <>
            <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">{actions}</div>
            <ToolbarSheet icon={<Ellipsis />} label="Actions" title="Actions">
              <div className="flex flex-col gap-2 px-4 *:w-full">{actions}</div>
            </ToolbarSheet>
          </>
        ) : (
          actions
        )}
        {viewOptions === true && <DataTableViewOptions table={table} />}
      </div>
    </div>
  );
};
interface DataTableToolbarFilterProps<TData extends RowData> {
  column: Column<TData>;
}

const DataTableToolbarFilter = <TData extends RowData>({
  column,
}: DataTableToolbarFilterProps<TData>) => {
  const columnMeta = column.columnDef.meta;

  const onFilterRender = React.useCallback(() => {
    if (columnMeta?.variant === undefined) {
      return null;
    }

    switch (columnMeta.variant) {
      case 'text':
        return (
          <Input
            className="h-8 w-40 lg:w-56"
            placeholder={columnMeta.placeholder ?? columnMeta.label}
            value={(column.getFilterValue() as string | undefined | null) ?? ''}
            onChange={(event) => {
              column.setFilterValue(event.target.value);
            }}
          />
        );

      case 'number':
        return (
          <div className="relative">
            <Input
              className={cn('h-8 w-[120px]', columnMeta.unit !== undefined && 'pr-8')}
              inputMode="numeric"
              placeholder={columnMeta.placeholder ?? columnMeta.label}
              type="number"
              value={(column.getFilterValue() as string | undefined | null) ?? ''}
              onChange={(event) => {
                column.setFilterValue(event.target.value);
              }}
            />
            {columnMeta.unit !== undefined && (
              <span className="bg-accent text-muted-foreground absolute top-0 right-0 bottom-0 flex items-center rounded-r-md px-2 text-sm">
                {columnMeta.unit}
              </span>
            )}
          </div>
        );

      case 'range':
        return <DataTableSliderFilter column={column} title={getColumnLabel(column)} />;

      case 'numberCompare':
        return <DataTableNumberFilter column={column} title={getColumnLabel(column)} />;

      case 'date':
      case 'dateRange':
        return (
          <DataTableDateFilter
            column={column}
            multiple={columnMeta.variant === 'dateRange'}
            title={getColumnLabel(column)}
          />
        );

      case 'select':
      case 'multiSelect':
        return (
          <DataTableFacetedFilter
            column={column}
            multiple={columnMeta.variant === 'multiSelect'}
            options={columnMeta.options ?? []}
            title={getColumnLabel(column)}
          />
        );
      case 'boolean':
      default:
        return null;
    }
  }, [column, columnMeta]);

  return onFilterRender();
};
