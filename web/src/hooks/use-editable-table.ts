'use client';

import * as React from 'react';

import { useDataGrid, type UseDataGridProps } from '@/hooks/use-data-grid';
import { prepareGridColumns } from '@/lib/data-grid';

export type EditableTableMode = 'view' | 'edit';

interface UseEditableTableProps<TData> extends Omit<UseDataGridProps<TData>, 'readOnly'> {
  mode: EditableTableMode;
}

export const useEditableTable = <TData>({
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
