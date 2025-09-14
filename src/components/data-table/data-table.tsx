import type * as React from 'react';

import { flexRender, type Row, type Table as TanstackTable } from '@tanstack/react-table';

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

type DataTableProps<TData extends object> = React.ComponentProps<'div'> & {
  table: TanstackTable<TData>;
  actionBar?: React.ReactNode;
  onItemDropped?: (item: {
    itemId: string;
    prevIndex: number;
    newIndex: number;
    item: TData;
  }) => void;
};

export const DataTable = <TData extends object>({
  table,
  actionBar,
  children,
  className,
  onItemDropped,
  ...props
}: DataTableProps<TData>) => {
  const { rows } = table.getRowModel();
  const hasRows = rows.length > 0;
  const hasSelectedRows = table.getFilteredSelectedRowModel().rows.length > 0;

  return (
    <div className={cn('flex w-full flex-col gap-2.5 overflow-auto', className)} {...props}>
      {children}
      <div className="overflow-hidden rounded-md border">
        <Sortable
          getItemValue={(item) => item.id}
          value={rows}
          onValueChange={(items: Row<TData>[]) => {
            const originalIds = rows.map((row) => row.id);
            const newIds = items.map((row) => row.id);
            let maxDistance = 0;
            let draggedItemInfo: {
              itemId: string;
              prevIndex: number;
              newIndex: number;
              item: TData;
            } | null = null;
            for (let i = 0; i < newIds.length; i++) {
              const itemId = newIds[i];
              const prevIndex = originalIds.indexOf(itemId);
              const newIndex = i;
              if (prevIndex !== newIndex) {
                const distance = Math.abs(prevIndex - newIndex);
                if (distance > maxDistance) {
                  maxDistance = distance;
                  draggedItemInfo = {
                    itemId,
                    prevIndex,
                    newIndex,
                    item: items[newIndex]?.original,
                  };
                }
              }
            }
            if (draggedItemInfo !== null) {
              onItemDropped?.(draggedItemInfo);
            }
          }}
        >
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        ...getCommonPinningStyles({ column: header.column }),
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
                    <SortableItem key={row.id} asChild value={row.id}>
                      <TableRow data-state={row.getIsSelected() && 'selected'}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            style={{
                              ...getCommonPinningStyles({ column: cell.column }),
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
        <DataTablePagination table={table} />
        {actionBar !== undefined && hasSelectedRows ? actionBar : null}
      </div>
    </div>
  );
};
