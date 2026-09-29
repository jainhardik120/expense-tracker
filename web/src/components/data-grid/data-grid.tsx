'use client';

import * as React from 'react';

import { Plus } from 'lucide-react';

import { DataGridColumnHeader } from '@/components/data-grid/data-grid-column-header';
import { DataGridContextMenu } from '@/components/data-grid/data-grid-context-menu';
import { DataGridPasteDialog } from '@/components/data-grid/data-grid-paste-dialog';
import { DataGridRow } from '@/components/data-grid/data-grid-row';
import { DataGridSearch } from '@/components/data-grid/data-grid-search';
import { useAsRef } from '@/hooks/use-as-ref';
import type { useDataGrid } from '@/hooks/use-data-grid';
import {
  flexRender,
  getColumnBorderVisibility,
  getColumnPinningStyle,
  getColumnWidthStyle,
} from '@/lib/data-grid';
import { cn } from '@/lib/utils';
import type { Direction } from '@/types/data-grid';

const EMPTY_CELL_SELECTION_SET = new Set<string>();

interface DataGridProps<TData>
  extends
    Omit<ReturnType<typeof useDataGrid<TData>>, 'dir'>,
    Omit<React.ComponentProps<'div'>, 'contextMenu'> {
  dir?: Direction;
  height?: number;
  /**
   * Fill the space the grid is given instead of capping at `height`.
   *
   * For a screen that is the table: the rows area takes whatever is left once
   * the toolbar and pagination have had theirs, and scrolls inside itself, so
   * the page around it never does.
   */
  fill?: boolean;
  /**
   * `true` widens every column to fill the space. `'last'` widens only the
   * final one, which keeps every other column at the width it asked for -- so
   * a column shown by two different sets of columns sits in the same place in
   * both, and the slack collects on the right instead of being shared out.
   */
  stretchColumns?: boolean | 'last';
  /** Shown in place of the rows when there are none. */
  emptyState?: React.ReactNode;
}

export const DataGrid = <TData,>({
  dataGridRef,
  headerRef,
  rowMapRef,
  footerRef,
  dir = 'ltr',
  table,
  tableMeta,
  virtualTotalSize,
  virtualItems,
  measureElement,
  columns,
  columnSizeVars,
  searchState,
  searchMatchesByRow,
  activeSearchMatch,
  cellSelectionMap,
  focusedCell,
  editingCell,
  rowHeight,
  contextMenu,
  pasteDialog,
  onRowAdd: onRowAddProp,
  height = 600,
  fill = false,
  stretchColumns = false,
  emptyState = 'No results.',
  adjustLayout = false,
  className,
  ...props
}: DataGridProps<TData>) => {
  const { rows } = table.getRowModel();
  const readOnly = tableMeta?.readOnly ?? false;
  const { columnVisibility } = table.getState();
  const { columnPinning } = table.getState();

  const onRowAddRef = useAsRef(onRowAddProp);

  const onRowAdd = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      onRowAddRef.current?.(event);
    },
    [onRowAddRef],
  );

  const onDataGridContextMenu = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const onFooterCellKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onRowAddRef.current) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onRowAddRef.current();
      }
    },
    [onRowAddRef],
  );

  /**
   * The narrowest the columns will go before the list scrolls sideways.
   *
   * Needed as a width, not just as a limit on each column, because the rows are
   * painted inside a contained box: content that overflows it is clipped rather
   * than scrolled, so columns at their floor in a window narrower than their
   * total would simply be cut off. Making the box itself that wide turns the
   * overflow back into a scrollbar, which is what a table does.
   */
  const minGridWidth =
    stretchColumns === true
      ? table
          .getVisibleLeafColumns()
          .reduce(
            (total, column) =>
              total +
              (column.columnDef.meta?.fixedWidth === true || column.getIsPinned() !== false
                ? column.getSize()
                : (column.columnDef.minSize ?? 0)),
            0,
          )
      : undefined;

  return (
    <div
      data-slot="grid-wrapper"
      dir={dir}
      {...props}
      className={cn('relative flex w-full flex-col', fill && 'min-h-0 flex-1', className)}
    >
      {searchState ? <DataGridSearch {...searchState} /> : null}
      <DataGridContextMenu columns={columns} contextMenu={contextMenu} tableMeta={tableMeta} />
      <DataGridPasteDialog pasteDialog={pasteDialog} tableMeta={tableMeta} />
      <div
        ref={dataGridRef}
        aria-colcount={columns.length}
        aria-label="Data grid"
        aria-rowcount={rows.length + (onRowAddProp ? 1 : 0)}
        // `text-sm` to match DataTable, which sets it on the <table> element
        // and lets every cell inherit. Without it the grid falls back to the
        // body's 16px and reads a size larger than every other table.
        className={cn(
          'relative grid overflow-auto rounded-md border text-sm select-none focus:outline-none',
          // `min-h-0` or a flex item refuses to shrink below its content, and
          // the rows would push the pagination off the bottom of the screen
          // rather than scrolling inside their own box.
          fill && 'min-h-0 flex-1',
        )}
        data-slot="grid"
        role="grid"
        style={{
          ...columnSizeVars,
          ...(fill ? {} : { maxHeight: `${height}px` }),
        }}
        tabIndex={0}
        onContextMenu={onDataGridContextMenu}
      >
        <div
          ref={headerRef}
          className="bg-background sticky top-0 z-10 grid border-b"
          data-slot="grid-header"
          role="rowgroup"
          style={{ minWidth: minGridWidth }}
        >
          {table.getHeaderGroups().map((headerGroup, rowIndex) => (
            <div
              key={headerGroup.id}
              aria-rowindex={rowIndex + 1}
              // The height a DataTable header has. Left to its contents the row
              // came out at whatever the tallest control in it happened to be --
              // forty pixels where a column drew a sort button, twenty-eight
              // where it drew plain text -- so two grids on neighbouring screens
              // disagreed about how tall a header is.
              className="flex min-h-10 w-full"
              data-slot="grid-header-row"
              role="row"
              tabIndex={-1}
            >
              {headerGroup.headers.map((header, colIndex) => {
                const { sorting } = table.getState();
                const currentSort = sorting.find((sort) => sort.id === header.column.id);
                const isSortable = header.column.getCanSort();

                const nextHeader = headerGroup.headers[colIndex + 1];
                const isLastColumn = colIndex === headerGroup.headers.length - 1;

                const { showEndBorder, showStartBorder } = getColumnBorderVisibility({
                  column: header.column,
                  nextColumn: nextHeader?.column,
                  isLastColumn,
                });

                return (
                  <div
                    key={header.id}
                    aria-colindex={colIndex + 1}
                    aria-sort={
                      currentSort?.desc === false
                        ? 'ascending'
                        : currentSort?.desc === true
                          ? 'descending'
                          : isSortable
                            ? 'none'
                            : undefined
                    }
                    className={cn(
                      'relative font-medium',
                      // What a DataTable's <th> does with meta.align, so a
                      // column of figures reads the same in both.
                      header.column.columnDef.meta?.align === 'right' &&
                        'text-right tabular-nums',
                      {
                        'border-e': showEndBorder && header.column.id !== 'select',
                        'border-s': showStartBorder && header.column.id !== 'select',
                      },
                    )}
                    data-slot="grid-header-cell"
                    role="columnheader"
                    style={{
                      ...getColumnPinningStyle({ column: header.column, dir }),
                      ...getColumnWidthStyle({
                        column: header.column,
                        stretchColumns,
                        isLastColumn,
                        sizeVar: `--header-${header.id}-size`,
                      }),
                    }}
                    tabIndex={-1}
                  >
                    {header.isPlaceholder ? null : typeof header.column.columnDef.header ===
                      'function' ? (
                      <div
                        className={cn(
                          'flex size-full items-center px-2 py-1',
                          header.column.columnDef.meta?.align === 'right'
                            ? 'justify-end'
                            : 'justify-start',
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    ) : (
                      <DataGridColumnHeader header={header} table={table} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div
          className="relative grid"
          data-slot="grid-body"
          role="rowgroup"
          style={{
            // With no rows the virtualiser measures nothing, so the body would
            // collapse and take the empty state with it.
            height: rows.length === 0 ? '6rem' : `${virtualTotalSize}px`,
            minWidth: minGridWidth,
            contain: adjustLayout ? 'layout paint' : 'strict',
          }}
        >
          {rows.length === 0 ? (
            <div
              className="text-muted-foreground absolute flex h-24 w-full items-center justify-center text-sm"
              data-slot="grid-empty"
              role="row"
            >
              {emptyState}
            </div>
          ) : null}
          {virtualItems.map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) {
              return null;
            }

            const cellSelectionKeys =
              cellSelectionMap?.get(virtualItem.index) ?? EMPTY_CELL_SELECTION_SET;

            const searchMatchColumns = searchMatchesByRow?.get(virtualItem.index) ?? null;
            const isActiveSearchRow = activeSearchMatch?.rowIndex === virtualItem.index;

            return (
              <DataGridRow
                key={row.id}
                activeSearchMatch={isActiveSearchRow ? activeSearchMatch : null}
                adjustLayout={adjustLayout}
                cellSelectionKeys={cellSelectionKeys}
                columnPinning={columnPinning}
                columnVisibility={columnVisibility}
                dir={dir}
                editingCell={editingCell}
                focusedCell={focusedCell}
                measureElement={measureElement}
                readOnly={readOnly}
                row={row}
                rowHeight={rowHeight}
                rowMapRef={rowMapRef}
                searchMatchColumns={searchMatchColumns}
                stretchColumns={stretchColumns}
                tableMeta={tableMeta}
                virtualItem={virtualItem}
              />
            );
          })}
        </div>
        {/* `onRowAddProp`, not the callback below it: that one is a wrapper
            this component always defines, so testing it showed an "Add row"
            footer on every editable grid, including the ones with nothing to
            add a row to. */}
        {!readOnly && onRowAddProp ? (
          <div
            ref={footerRef}
            className="bg-background sticky bottom-0 z-10 grid border-t"
            data-slot="grid-footer"
            role="rowgroup"
          >
            <div
              aria-rowindex={rows.length + 2}
              className="flex w-full"
              data-slot="grid-add-row"
              role="row"
              tabIndex={-1}
            >
              <div
                className="bg-muted/30 hover:bg-muted/50 focus:bg-muted/50 relative flex h-9 grow items-center transition-colors focus:outline-none"
                role="gridcell"
                style={{
                  width: table.getTotalSize(),
                  minWidth: table.getTotalSize(),
                }}
                tabIndex={0}
                onClick={onRowAdd}
                onKeyDown={onFooterCellKeyDown}
              >
                <div className="text-muted-foreground sticky start-0 flex items-center gap-2 px-3">
                  <Plus className="size-3.5" />
                  <span className="text-sm">Add row</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
