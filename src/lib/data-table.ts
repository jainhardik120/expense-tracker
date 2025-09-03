import { dataTableConfig } from '@/config/data-table';
import type { ExtendedColumnFilter, FilterOperator, FilterVariant } from '@/types/data-table';

import type { Column } from '@tanstack/react-table';

// eslint-disable-next-line complexity
export const getCommonPinningStyles = <TData>({
  column,
  withBorder = false,
}: {
  column: Column<TData>;
  withBorder?: boolean;
}): React.CSSProperties => {
  const isPinned = column.getIsPinned();
  const isLastLeftPinnedColumn = isPinned === 'left' && column.getIsLastColumn('left');
  const isFirstRightPinnedColumn = isPinned === 'right' && column.getIsFirstColumn('right');

  let boxShadow;
  if (withBorder) {
    if (isLastLeftPinnedColumn) {
      boxShadow = '-4px 0 4px -4px hsl(var(--border)) inset';
    } else if (isFirstRightPinnedColumn) {
      boxShadow = '4px 0 4px -4px hsl(var(--border)) inset';
    } else {
      boxShadow = undefined;
    }
  } else {
    boxShadow = undefined;
  }

  const PINNED_OPACITY = 0.97;

  return {
    boxShadow,
    left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    opacity: isPinned === false ? 1 : PINNED_OPACITY,
    position: isPinned === false ? 'relative' : 'sticky',
    background: 'hsl(var(--background))',
    width: column.getSize(),
    zIndex: isPinned === false ? 0 : 1,
  };
};

export const getFilterOperators = (filterVariant: FilterVariant) => {
  const operatorMap: Record<FilterVariant, { label: string; value: FilterOperator }[]> = {
    text: dataTableConfig.textOperators,
    number: dataTableConfig.numericOperators,
    range: dataTableConfig.numericOperators,
    date: dataTableConfig.dateOperators,
    dateRange: dataTableConfig.dateOperators,
    boolean: dataTableConfig.booleanOperators,
    select: dataTableConfig.selectOperators,
    multiSelect: dataTableConfig.multiSelectOperators,
  };

  return operatorMap[filterVariant];
};

export const getDefaultFilterOperator = (filterVariant: FilterVariant) => {
  const operators = getFilterOperators(filterVariant);

  return operators[0]?.value ?? (filterVariant === 'text' ? 'iLike' : 'eq');
};

export const getValidFilters = <TData>(
  filters: ExtendedColumnFilter<TData>[],
): ExtendedColumnFilter<TData>[] =>
  filters.filter(
    (filter) =>
      filter.operator === 'isEmpty' ||
      filter.operator === 'isNotEmpty' ||
      (Array.isArray(filter.value) ? filter.value.length > 0 : filter.value !== ''),
  );
