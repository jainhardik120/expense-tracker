'use client';

import * as React from 'react';

import { useDataGrid, type UseDataGridProps } from '@/hooks/use-data-grid';
import { prepareGridColumns } from '@/lib/data-grid';

/**
 * Reading or editing. The same table either way -- the same rows, the same
 * columns, the same widths -- so that switching between them is a change of
 * what the cells do rather than of what is on screen.
 */
export type EditableTableMode = 'view' | 'edit';

interface UseEditableTableProps<TData> extends Omit<UseDataGridProps<TData>, 'readOnly'> {
  mode: EditableTableMode;
}

/**
 * A grid that spends most of its life pretending to be a table.
 *
 * `readOnly` is the whole of the difference: in view mode every column falls
 * back to the renderer it brought with it -- formatted money, a status badge, a
 * row's actions -- and in edit mode the columns that declared `meta.cell` swap
 * to their editors. Columns that declared no editor never become editable, in
 * either mode.
 *
 * Columns are prepared here rather than by the caller, because the flag that
 * records whether a column brought its own renderer cannot be recovered once
 * the table exists: TanStack fills in a default `cell` for every column that
 * does without one.
 */
export const useEditableTable = <TData,>({
  mode,
  columns,
  ...props
}: UseEditableTableProps<TData>) => {
  const preparedColumns = React.useMemo(() => prepareGridColumns(columns), [columns]);

  const grid = useDataGrid<TData>({
    ...props,
    columns: preparedColumns,
    readOnly: mode === 'view',
  });

  return { ...grid, mode };
};
