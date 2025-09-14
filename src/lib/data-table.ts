import { dataTableConfig } from '@/config/data-table';
import type { ExtendedColumnFilter, FilterOperator, FilterVariant } from '@/types/data-table';

import type { Column } from '@tanstack/react-table';

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
  let boxShadowValue;
  if (withBorder) {
    if (isLastLeftPinnedColumn) {
      boxShadowValue = '-4px 0 4px -4px hsl(var(--border)) inset';
    } else if (isFirstRightPinnedColumn) {
      boxShadowValue = '4px 0 4px -4px hsl(var(--border)) inset';
    } else {
      boxShadowValue = undefined;
    }
  } else {
    boxShadowValue = undefined;
  }
  return {
    boxShadow: boxShadowValue,
    left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    opacity: isPinned !== false ? 0.97 : 1,
    position: isPinned !== false ? 'sticky' : 'relative',
    background: 'hsl(var(--background))',
    width: column.getSize(),
    zIndex: isPinned !== false ? 1 : 0,
  };
};

export const getFilterOperators = (filterVariant: FilterVariant) => {
  const operatorMap: Partial<Record<FilterVariant, { label: string; value: FilterOperator }[]>> = {
    text: dataTableConfig.textOperators,
    number: dataTableConfig.numericOperators,
    range: dataTableConfig.numericOperators,
    date: dataTableConfig.dateOperators,
    dateRange: dataTableConfig.dateOperators,
    boolean: dataTableConfig.booleanOperators,
    select: dataTableConfig.selectOperators,
    multiSelect: dataTableConfig.multiSelectOperators,
  };

  return operatorMap[filterVariant] ?? dataTableConfig.textOperators;
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
