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
  /**
   * Fill the space the table is given instead of growing with its rows.
   *
   * For a screen that is the table: the rows take whatever is left once the
   * toolbar and pagination have had theirs and scroll inside their own box, so
   * the page around them never scrolls and the pagination stays put. The
   * heading sticks to the top of that box, the way it would to the top of the
   * page otherwise.
   */
  fill?: boolean;
  /**
   * Let a rectangle of cells be swept out with the pointer, copied, and totalled.
   *
   * Off by default: a table whose rows are a list of links wants a click to
   * follow one, not to start a selection.
   */
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
  fill = false,
  enableCellSelection = false,
  ...props
}: DataTableProps<TData>) => {
  const { rows } = table.getRowModel();
  // Only a table that can be reordered pays for drag and drop. Every row of a
  // sortable table registers with dnd-kit through hooks and context, and on a
  // table nobody can drag that was pure cost -- the two tables on the
  // dashboard were about a quarter of the CPU it takes to render.
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
                          // `relative` so a cell can be drawn right to its
                          // own edges -- a spreadsheet's box sits on the
                          // cell border, not inside its padding.
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
        // A height, not a share of one. Growing to fill works only while the
        // rows are short: the panel this sits in takes its height from its
        // contents, so a long enough table pushes it past the screen and the
        // page scrolls after all. Told exactly how tall to be, it cannot.
        // The subtraction is the app's chrome above and below -- the 4rem
        // header and the 2rem of padding around the page.
        fill ? 'h-[calc(100svh-var(--page-chrome,6rem))] min-h-0' : 'overflow-auto',
        className,
      )}
      {...props}
    >
      {/* The toolbar keeps its size; only the rows between it and the
          pagination give way. */}
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
