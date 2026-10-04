import { type RowData } from '@tanstack/react-table';

import type { Column } from '@/lib/table';

export const getCommonPinningStyles = <TData extends RowData>({
  column,
  withBorder = false,
}: {
  column: Column<TData>;
  withBorder?: boolean;
}): React.CSSProperties => {
  const isPinned = column.getIsPinned();
  const isLastLeftPinnedColumn = isPinned === 'start' && column.getIsLastColumn('start');
  const isFirstRightPinnedColumn = isPinned === 'end' && column.getIsFirstColumn('end');
  let boxShadowValue: string | undefined;
  if (withBorder) {
    if (isLastLeftPinnedColumn) {
      boxShadowValue = '-4px 0 4px -4px var(--border) inset';
    } else if (isFirstRightPinnedColumn) {
      boxShadowValue = '4px 0 4px -4px var(--border) inset';
    }
  }
  return {
    boxShadow: boxShadowValue,
    left: isPinned === 'start' ? `${column.getStart('start')}px` : undefined,
    right: isPinned === 'end' ? `${column.getAfter('end')}px` : undefined,
    position: isPinned !== false ? 'sticky' : 'relative',
    width: column.getSize(),
    zIndex: isPinned !== false ? 1 : 0,
  };
};
