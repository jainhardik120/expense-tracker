import * as React from 'react';

import {
  defaultColumnSizing,
  flexRender,
  type Column,
  type Row,
  type Table as TanstackTable,
} from '@tanstack/react-table';

import {
  DataTableCellSelectionStatus,
  hasCellSelectionSummary,
} from '@/components/data-table/data-table-cell-selection-status';
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
import { useCellRangeSelection } from '@/hooks/use-cell-range-selection';
import { getCommonPinningStyles } from '@/lib/data-table';
import { cn } from '@/lib/utils';

const alignmentClass = <TData, TValue>(column: Column<TData, TValue>) =>
  column.columnDef.meta?.align === 'right' ? 'text-right tabular-nums' : undefined;

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
  layout?: 'auto' | 'fixed';
  fill?: boolean;
  enableCellSelection?: boolean;
};

const SortableContentIf = ({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactElement;
}) => (enabled ? <SortableContent asChild>{children}</SortableContent> : children);

const SortableItemIf = ({
  enabled,
  value,
  children,
}: {
  enabled: boolean;
  value: string;
  children: React.ReactElement;
}) =>
  enabled ? (
    <SortableItem asChild value={value}>
      {children}
    </SortableItem>
  ) : (
    children
  );

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
  fill = false,
  enableCellSelection = false,
  ...props
}: DataTableProps<TData>) => {
  const { rows } = table.getRowModel();
  const sortable = onValueChange !== undefined;
  const hasRows = rows.length > 0;
  const hasSelectedRows = table.getFilteredSelectedRowModel().rows.length > 0;
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const cellSelection = useCellRangeSelection({
    enabled: enableCellSelection,
    containerRef: bodyRef,
  });

  const tableElement = (
    <>
      <Table className={layout === 'fixed' ? 'table-fixed' : undefined}>
        <TableHeader className={fill ? '[&_th]:sticky [&_th]:top-0 [&_th]:z-10' : undefined}>
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
        <SortableContentIf enabled={sortable}>
          <TableBody>
            {hasRows ? (
              rows.map((row) => (
                <SortableItemIf
                  key={getItemValue(row.original)}
                  enabled={sortable}
                  value={getItemValue(row.original)}
                >
                  <TableRow
                    className={cn(onRowClick !== undefined && 'hover:bg-muted/50 cursor-pointer')}
                    data-state={row.getIsSelected() && 'selected'}
                    onClick={
                      onRowClick === undefined
                        ? undefined
                        : (event) => {
                            if (
                              (event.target as HTMLElement).closest(INTERACTIVE_SELECTOR) !== null
                            ) {
                              return;
                            }
                            onRowClick(row.original);
                          }
                    }
                  >
                    {row.getVisibleCells().map((cell, columnIndex) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'relative h-10 py-1',
                          background && 'bg-background',
                          alignmentClass(cell.column),
                          enableCellSelection &&
                            cell.column.columnDef.meta?.selectable !== false &&
                            cellSelection.isSelected(row.index, columnIndex) &&
                            'bg-primary/15',
                        )}
                        data-cell-col={
                          enableCellSelection && cell.column.columnDef.meta?.selectable !== false
                            ? columnIndex
                            : undefined
                        }
                        data-cell-row={
                          enableCellSelection && cell.column.columnDef.meta?.selectable !== false
                            ? row.index
                            : undefined
                        }
                        style={{
                          ...getCommonPinningStyles({ column: cell.column, withBorder: true }),
                          ...widthStyle(cell.column, layout),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                </SortableItemIf>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={table.getAllColumns().length}>
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </SortableContentIf>
      </Table>
      {sortable ? (
        <SortableOverlay>
          <div className="bg-primary/10 size-full rounded-none" />
        </SortableOverlay>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-2.5',
        fill ? 'h-[calc(100svh-var(--page-chrome,6rem))] min-h-0' : 'overflow-auto',
        className,
      )}
      {...props}
    >
      {fill ? <div className="shrink-0">{children}</div> : children}
      <div
        ref={bodyRef}
        className={cn(
          showBorder && 'rounded-md border',
          fill ? 'min-h-0 flex-1 overflow-auto' : 'overflow-hidden',
        )}
        {...(enableCellSelection ? cellSelection.containerHandlers : {})}
      >
        {sortable ? (
          <Sortable
            getItemValue={(item) => getItemValue(item.original)}
            value={rows}
            onValueChange={onValueChange}
          >
            {tableElement}
          </Sortable>
        ) : (
          tableElement
        )}
      </div>
      <div className={cn('flex flex-col gap-2.5', fill && 'shrink-0')}>
        {enablePagination === true && (
          <DataTablePagination
            enableSelection={enableSelection}
            status={
              hasCellSelectionSummary(cellSelection.stats) ? (
                <DataTableCellSelectionStatus stats={cellSelection.stats} />
              ) : null
            }
            table={table}
          />
        )}
        {actionBar !== undefined && hasSelectedRows ? actionBar : null}
      </div>
    </div>
  );
};
