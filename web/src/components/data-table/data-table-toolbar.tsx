'use client';

import * as React from 'react';

import { X } from 'lucide-react';

import { DataTableDateFilter } from '@/components/data-table/data-table-date-filter';
import { DataTableFacetedFilter } from '@/components/data-table/data-table-faceted-filter';
import { DataTableSliderFilter } from '@/components/data-table/data-table-slider-filter';
import { DataTableViewOptions } from '@/components/data-table/data-table-view-options';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { Column, Table } from '@tanstack/react-table';

// `title` is omitted from the div's own props: there it is the browser's
// tooltip attribute and only takes a string, which would stop this one being a
// node.
interface DataTableToolbarProps<TData> extends Omit<React.ComponentProps<'div'>, 'title'> {
  table: Table<TData>;
  viewOptions?: boolean;
  /**
   * What the table is, shown on the left of the toolbar.
   *
   * A table with no filters leaves that side empty, so a heading written above
   * the table sat on its own line with the actions on the next one -- two rows
   * of chrome for one row of content. Put here it shares the line with them.
   * When there are filters too, it sits above them on the same side.
   */
  title?: React.ReactNode;
}

export const DataTableToolbar = <TData,>({
  table,
  children,
  className,
  viewOptions = true,
  title,
  ...props
}: DataTableToolbarProps<TData>) => {
  const isFiltered = table.getState().columnFilters.length > 0;

  // Keyed on the columns themselves, not on `table`. The table instance is
  // stable for the life of the component, so memoising on it pinned the filter
  // options to whatever the first render produced -- new options arriving from
  // the server were built but never read. getAllColumns is itself memoised on
  // the column definitions, so this recomputes exactly when they change.
  const allColumns = table.getAllColumns();
  const columns = React.useMemo(
    () => allColumns.filter((column) => column.getCanFilter()),
    [allColumns],
  );

  const onReset = React.useCallback(() => {
    table.resetColumnFilters();
  }, [table]);

  return (
    <div
      aria-orientation="horizontal"
      className={cn(
        'flex w-full justify-between gap-2',
        // A heading is one line, the same height as the buttons opposite it, so
        // they read as one row. Filters on their own still hang from the top,
        // where a second wrapped line of them grows downwards.
        title === undefined ? 'items-start' : 'items-center',
        className,
      )}
      role="toolbar"
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {title === undefined ? null : <h2 className="min-w-0 font-semibold">{title}</h2>}
        <div className="flex flex-wrap items-center gap-2 empty:hidden">
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
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {children}
        {viewOptions === true && <DataTableViewOptions table={table} />}
      </div>
    </div>
  );
};
interface DataTableToolbarFilterProps<TData> {
  column: Column<TData>;
}

const DataTableToolbarFilter = <TData,>({ column }: DataTableToolbarFilterProps<TData>) => {
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
        return <DataTableSliderFilter column={column} title={columnMeta.label ?? column.id} />;

      case 'date':
      case 'dateRange':
        return (
          <DataTableDateFilter
            column={column}
            multiple={columnMeta.variant === 'dateRange'}
            title={columnMeta.label ?? column.id}
          />
        );

      case 'select':
      case 'multiSelect':
        return (
          <DataTableFacetedFilter
            column={column}
            multiple={columnMeta.variant === 'multiSelect'}
            options={columnMeta.options ?? []}
            title={columnMeta.label ?? column.id}
          />
        );
      case 'boolean':
      default:
        return null;
    }
  }, [column, columnMeta]);

  return onFilterRender();
};
