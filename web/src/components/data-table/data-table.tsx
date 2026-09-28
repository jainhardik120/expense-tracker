import type * as React from 'react';

import {
  defaultColumnSizing,
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

/**
 * The width a column gets under `layout="fixed"`, and nothing at all otherwise.
 *
 * Applied over the pinning styles, which set a width on every column from
 * `getSize()`. Laying out automatically that width is only ever a minimum, so
 * the 150 an undeclared column reports does no harm -- but a fixed layout takes
 * it literally, leaves no column free to absorb the slack, and stretches all of
 * them in proportion instead. A six column table then drew the same declared 64
 * at 159 while a ten column one drew it at 71.
 *
 * So under a fixed layout a column that asked for a width gets exactly it, and
 * one that did not is cleared back to auto and shares out what is left.
 *
 * Compared against TanStack's own default rather than checked for presence:
 * every column definition is given `size: 150` when the table is built, so by
 * the time a header is rendered "has a size" is true of all of them.
 */
const widthStyle = <TData, TValue>(
  column: Column<TData, TValue>,
  layout: 'auto' | 'fixed',
): React.CSSProperties => {
  if (layout === 'auto') {
    return {};
  }
  return column.columnDef.size === defaultColumnSizing.size
    ? { width: undefined }
    : { width: column.columnDef.size };
};

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
  /**
   * `auto` lets the browser size the columns from their contents, which is what
   * a table of free text wants. `fixed` honours the widths the columns declare
   * and splits what is left between the ones that declared none -- which is how
   * two tables stacked on a page keep their row numbers and row handles in the
   * same place as each other.
   */
  layout?: 'auto' | 'fixed';
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
  layout = 'auto',
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
          <Table className={layout === 'fixed' ? 'table-fixed' : undefined}>
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
                        ...widthStyle(header.column, layout),
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
                              ...widthStyle(cell.column, layout),
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
