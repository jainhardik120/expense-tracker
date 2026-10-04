import { type RowData } from '@tanstack/react-table';
import { GripVertical } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SortableItemHandle } from '@/components/ui/sortable';
import type { ColumnDef } from '@/lib/table';

export const BUDGET_COLUMN_SIZE = {
  position: 64,
  actions: 64,
  dragHandle: 48,
  claims: 320,
} as const;

export const POSITION_INDENT = 'pl-2';

export const dragHandleColumn = <T extends RowData>(
  isFixed?: (row: T) => boolean,
): ColumnDef<T> => ({
  id: 'drag-handle',
  header: '',
  cell: ({ row }) =>
    isFixed?.(row.original) === true ? null : (
      <SortableItemHandle asChild>
        <Button className="size-8" size="icon" variant="ghost">
          <GripVertical className="size-4" />
        </Button>
      </SortableItemHandle>
    ),
  enableSorting: false,
  enableHiding: false,
  size: BUDGET_COLUMN_SIZE.dragHandle,
});
