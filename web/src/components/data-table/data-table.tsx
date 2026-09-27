import type * as React from 'react';

import {
  flexRender,
  type Column,
  type Row,
  type Table as TanstackTable,
} from '@tanstack/react-table';

import { DataTablePagination } from '@/components/data-table/data-table-pagination';
import { Sortable, SortableContent, SortableItem, SortableOverlay } from '@/components/ui/sortable';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getCommonPinningStyles } from '@/lib/data-table';
import { cn } from '@/lib/utils';

/**
 * Right aligned columns get tabular figures with it: digits of the same width
 * are what makes a column of amounts comparable at a glance.
 */
const alignmentClass = <TData, TValue>(column: Column<TData, TValue>) =>
  column.columnDef.meta?.align === 'right' ? 'text-right tabular-nums' : undefined;

type DataTableProps<TData extends object> = React.ComponentProps<'div'> & {
  table: TanstackTable<TData>;
  actionBar?: React.ReactNode;
  onValueChange?: (items: Row<TData>[]) => void;
  getItemValue: (item: TData) => string;
  enablePagination?: boolean;
  showBorder?: boolean;
  background?: boolean;
  onRowClick?: (item: TData) => void;
  enableSelection?: boolean;
};

// A row can hold its own buttons, links and dialog triggers; a click on one of
// those is meant for the control, not for the row.
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, [role="checkbox"]';

export const DataTable = <TData extends object>({
  table,
  actionBar,
  children,
  className,
  onValueChange,
  getItemValue,
  enablePagination = true,
  showBorder = true,
  background = true,
  onRowClick,
  enableSelection = true,
  ...props
}: DataTableProps<TData>) => {
  const { rows } = table.getRowModel();
  const hasRows = rows.length > 0;
  const hasSelectedRows = table.getFilteredSelectedRowModel().rows.length > 0;

  return (
    <div className={cn('flex w-full flex-col gap-2.5 overflow-auto', className)} {...props}>
      {children}
      <div className={cn('overflow-hidden', showBorder && 'rounded-md border')}>
        <Sortable
          getItemValue={(item) => getItemValue(item.original)}
          value={rows}
          onValueChange={onValueChange}
        >
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(background && 'bg-background', alignmentClass(header.column))}
                      colSpan={header.colSpan}
                      style={{
                        ...getCommonPinningStyles({ column: header.column, withBorder: true }),
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <SortableContent asChild>
              <TableBody>
                {hasRows ? (
                  rows.map((row) => (
                    <SortableItem
                      key={getItemValue(row.original)}
                      asChild
                      value={getItemValue(row.original)}
                    >
                      <TableRow
                        className={cn(
                          onRowClick !== undefined && 'hover:bg-muted/50 cursor-pointer',
                        )}
                        data-state={row.getIsSelected() && 'selected'}
                        onClick={
                          onRowClick === undefined
                            ? undefined
                            : (event) => {
                                if (
                                  (event.target as HTMLElement).closest(INTERACTIVE_SELECTOR) !==
                                  null
                                ) {
                                  return;
                                }
                                onRowClick(row.original);
                              }
                        }
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className={cn(
                              'h-10 py-1',
                              background && 'bg-background',
                              alignmentClass(cell.column),
                            )}
                            style={{
                              ...getCommonPinningStyles({ column: cell.column, withBorder: true }),
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    </SortableItem>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="h-24 text-center" colSpan={table.getAllColumns().length}>
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </SortableContent>
          </Table>
          <SortableOverlay>
            <div className="bg-primary/10 size-full rounded-none" />
          </SortableOverlay>
        </Sortable>
      </div>
      <div className="flex flex-col gap-2.5">
        {enablePagination === true && <DataTablePagination enableSelection={enableSelection} table={table} />}
        {actionBar !== undefined && hasSelectedRows ? actionBar : null}
      </div>
    </div>
  );
};
