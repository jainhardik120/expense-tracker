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

interface DataTableToolbarProps<TData> extends React.ComponentProps<'div'> {
  table: Table<TData>;
}

export const DataTableToolbar = <TData,>({
  table,
  children,
  className,
  ...props
}: DataTableToolbarProps<TData>) => {
  const isFiltered = table.getState().columnFilters.length > 0;

  const columns = React.useMemo(
    () => table.getAllColumns().filter((column) => column.getCanFilter()),
    [table],
  );

  const onReset = React.useCallback(() => {
    table.resetColumnFilters();
  }, [table]);

  return (
    <div
      aria-orientation="horizontal"
      className={cn('flex w-full items-start justify-between gap-2 p-1', className)}
      role="toolbar"
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
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
      <div className="flex items-center gap-2">
        {children}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
};
interface DataTableToolbarFilterProps<TData> {
  column: Column<TData>;
}

const DataTableToolbarFilter = <TData,>({ column }: DataTableToolbarFilterProps<TData>) => {
  {
    const columnMeta = column.columnDef.meta;

    const onFilterRender = React.useCallback(() => {
      if (!columnMeta?.variant) {
        return null;
      }

      switch (columnMeta.variant) {
        case 'text':
          return (
            <Input
              className="h-8 w-40 lg:w-56"
              placeholder={columnMeta.placeholder ?? columnMeta.label}
              value={(column.getFilterValue() as string) ?? ''}
              onChange={(event) => {
                column.setFilterValue(event.target.value);
              }}
            />
          );
        case 'boolean':
          return null; // Add appropriate UI for boolean filter if needed

        case 'number':
          return (
            <div className="relative">
              <Input
                className={cn('h-8 w-[120px]', columnMeta.unit && 'pr-8')}
                inputMode="numeric"
                placeholder={columnMeta.placeholder ?? columnMeta.label}
                type="number"
                value={(column.getFilterValue() as string) ?? ''}
                onChange={(event) => {
                  column.setFilterValue(event.target.value);
                }}
              />
              {columnMeta.unit ? (
                <span className="bg-accent text-muted-foreground absolute top-0 right-0 bottom-0 flex items-center rounded-r-md px-2 text-sm">
                  {columnMeta.unit}
                </span>
              ) : null}
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

        default:
          return null;
      }
    }, [column, columnMeta]);

    return onFilterRender();
  }
};
