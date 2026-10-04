'use client';

import * as React from 'react';

import {
  type ColumnPinningState,
  type TableMeta,
  type ColumnVisibilityState,
  type RowData,
} from '@tanstack/react-table';

import { DataGridCell } from '@/components/data-grid/data-grid-cell';
import { useComposedRefs } from '@/lib/compose-refs';
import {
  flexRender,
  getCellKey,
  getCellRenderMode,
  getColumnBorderVisibility,
  getColumnPinningStyle,
  getColumnWidthStyle,
  getRowHeightValue,
} from '@/lib/data-grid';
import type { Row, AppTableFeatures } from '@/lib/table';
import { cn } from '@/lib/utils';
import type { CellPosition, Direction, RowHeightValue } from '@/types/data-grid';

import type { VirtualItem } from '@tanstack/react-virtual';

interface DataGridRowProps<TData extends RowData> extends React.ComponentProps<'div'> {
  row: Row<TData>;
  tableMeta: TableMeta<AppTableFeatures, TData>;
  virtualItem: VirtualItem;
  measureElement: (node: Element | null) => void;
  rowMapRef: React.RefObject<Map<number, HTMLDivElement>>;
  rowHeight: RowHeightValue;
  columnVisibility: ColumnVisibilityState;
  columnPinning: ColumnPinningState;
  focusedCell: CellPosition | null;
  editingCell: CellPosition | null;
  cellSelectionKeys: Set<string>;
  searchMatchColumns: Set<string> | null;
  activeSearchMatch: CellPosition | null;
  dir: Direction;
  readOnly: boolean;
  stretchColumns: boolean | 'last';
  adjustLayout: boolean;
}

const DataGridRowImpl = <TData extends RowData>({
  row,
  tableMeta,
  virtualItem,
  measureElement,
  rowMapRef,
  rowHeight,
  columnVisibility: _columnVisibility,
  columnPinning: _columnPinning,
  focusedCell,
  editingCell,
  cellSelectionKeys,
  searchMatchColumns,
  activeSearchMatch,
  dir,
  readOnly,
  stretchColumns,
  adjustLayout,
  className,
  style,
  ref,
  ...props
}: DataGridRowProps<TData>) => {
  const virtualRowIndex = virtualItem.index;

  const onRowChange = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (typeof virtualRowIndex === 'undefined') {
        return;
      }

      if (node !== null) {
        measureElement(node);
        rowMapRef.current.set(virtualRowIndex, node);
      } else {
        rowMapRef.current.delete(virtualRowIndex);
      }
    },
    [virtualRowIndex, measureElement, rowMapRef],
  );

  const rowRef = useComposedRefs(ref, onRowChange);

  const isRowSelected = row.getIsSelected();

  const visibleCells = row.getVisibleCells();

  return (
    <div
      key={row.id}
      aria-rowindex={virtualRowIndex + 2}
      aria-selected={isRowSelected}
      data-index={virtualRowIndex}
      data-slot="grid-row"
      role="row"
      tabIndex={-1}
      {...props}
      ref={rowRef}
      className={cn(
        'absolute flex w-full border-b',
        !adjustLayout && 'will-change-transform',
        className,
      )}
      style={{
        height: `${getRowHeightValue(rowHeight)}px`,
        ...(adjustLayout
          ? { top: `${virtualItem.start}px` }
          : { transform: `translateY(${virtualItem.start}px)` }),
        ...style,
      }}
    >
      {visibleCells.map((cell, colIndex) => {
        const columnId = cell.column.id;

        const isCellFocused =
          focusedCell?.rowIndex === virtualRowIndex && focusedCell.columnId === columnId;
        const isCellEditing =
          editingCell?.rowIndex === virtualRowIndex && editingCell.columnId === columnId;
        const isCellSelected = cellSelectionKeys.has(getCellKey(virtualRowIndex, columnId));

        const isSearchMatch = searchMatchColumns?.has(columnId) ?? false;
        const isActiveSearchMatch = activeSearchMatch?.columnId === columnId;

        const nextCell = visibleCells.at(colIndex + 1);
        const isLastColumn = colIndex === visibleCells.length - 1;
        const { showEndBorder, showStartBorder } = getColumnBorderVisibility({
          column: cell.column,
          nextColumn: nextCell?.column,
          isLastColumn,
        });

        return (
          <div
            key={cell.id}
            aria-colindex={colIndex + 1}
            className={cn({
              'border-e': showEndBorder && columnId !== 'select',
              'border-s': showStartBorder && columnId !== 'select',
              'text-right tabular-nums': cell.column.columnDef.meta?.align === 'right',
            })}
            data-highlighted={isCellFocused ? '' : undefined}
            data-slot="grid-cell"
            role="gridcell"
            style={{
              ...getColumnPinningStyle({ column: cell.column, dir }),
              ...getColumnWidthStyle({
                column: cell.column,
                stretchColumns,
                isLastColumn,
                sizeVar: `--col-${columnId}-size`,
              }),
            }}
            tabIndex={-1}
          >
            {getCellRenderMode({ column: cell.column, readOnly }) === 'display' ? (
              <div
                className={cn(
                  'flex size-full items-center truncate px-2 py-1',
                  cell.column.columnDef.meta?.align === 'right' ? 'justify-end' : 'justify-start',
                  { 'bg-primary/10': isRowSelected },
                )}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ) : (
              <DataGridCell
                cell={cell}
                columnId={columnId}
                isActiveSearchMatch={isActiveSearchMatch}
                isEditing={isCellEditing}
                isFocused={isCellFocused}
                isSearchMatch={isSearchMatch}
                isSelected={isCellSelected}
                readOnly={readOnly}
                rowHeight={rowHeight}
                rowIndex={virtualRowIndex}
                tableMeta={tableMeta}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const DataGridRow = React.memo(DataGridRowImpl, (prev, next) => {
  const prevRowIndex = prev.virtualItem.index;
  const nextRowIndex = next.virtualItem.index;

  if (prev.row.id !== next.row.id) {
    return false;
  }

  if (prev.row.original !== next.row.original) {
    return false;
  }

  if (prev.virtualItem.start !== next.virtualItem.start) {
    return false;
  }

  const prevHasFocus = prev.focusedCell?.rowIndex === prevRowIndex;
  const nextHasFocus = next.focusedCell?.rowIndex === nextRowIndex;

  if (prevHasFocus !== nextHasFocus) {
    return false;
  }

  if (nextHasFocus && prevHasFocus && prev.focusedCell.columnId !== next.focusedCell.columnId) {
    return false;
  }

  const prevHasEditing = prev.editingCell?.rowIndex === prevRowIndex;
  const nextHasEditing = next.editingCell?.rowIndex === nextRowIndex;

  if (prevHasEditing !== nextHasEditing) {
    return false;
  }

  if (nextHasEditing && prevHasEditing && prev.editingCell.columnId !== next.editingCell.columnId) {
    return false;
  }

  if (prev.cellSelectionKeys !== next.cellSelectionKeys) {
    return false;
  }

  if (prev.columnVisibility !== next.columnVisibility) {
    return false;
  }

  if (prev.rowHeight !== next.rowHeight) {
    return false;
  }

  if (prev.columnPinning !== next.columnPinning) {
    return false;
  }

  if (prev.readOnly !== next.readOnly) {
    return false;
  }

  if (prev.searchMatchColumns !== next.searchMatchColumns) {
    return false;
  }

  if (prev.activeSearchMatch?.columnId !== next.activeSearchMatch?.columnId) {
    return false;
  }

  if (prev.dir !== next.dir) {
    return false;
  }

  if (prev.adjustLayout !== next.adjustLayout) {
    return false;
  }

  if (prev.stretchColumns !== next.stretchColumns) {
    return false;
  }

  return true;
}) as typeof DataGridRowImpl;
