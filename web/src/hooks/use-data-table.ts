'use client';

import * as React from 'react';

import {
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
  useTable,
} from '@tanstack/react-table';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  type UseQueryStateOptions,
  useQueryState,
  useQueryStates,
  type SingleParser,
} from 'nuqs';

import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { writePageSizeCookie } from '@/lib/page-size';
import { getSortingStateParser } from '@/lib/parsers';
import { appTableFeatures, type TableOptions, type TableState } from '@/lib/table';
import type { ExtendedColumnSort } from '@/types/data-table';

const PAGE_KEY = 'page';
const PER_PAGE_KEY = 'perPage';
const SORT_KEY = 'sort';
const ARRAY_SEPARATOR = ',';
const DEBOUNCE_MS = 300;
const THROTTLE_MS = 50;
const DEFAULT_PAGE_SIZE = 10;

interface UseDataTableProps<TData extends RowData>
  extends
    Omit<
      TableOptions<TData>,
      'state' | 'pageCount' | 'features' | 'manualPagination' | 'manualSorting'
    >,
    Required<Pick<TableOptions<TData>, 'pageCount'>> {
  initialState?: Omit<Partial<TableState>, 'sorting'> & {
    sorting?: ExtendedColumnSort<TData>[];
  };
  history?: 'push' | 'replace';
  debounceMs?: number;
  throttleMs?: number;
  clearOnDefault?: boolean;
  enableAdvancedFilter?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  startTransition?: React.TransitionStartFunction;
  persistPageSizeKey?: string;
}

export const useDataTable = <TData extends RowData>(props: UseDataTableProps<TData>) => {
  const {
    columns,
    pageCount = -1,
    initialState,
    history = 'replace',
    debounceMs = DEBOUNCE_MS,
    throttleMs = THROTTLE_MS,
    clearOnDefault = false,
    scroll = false,
    shallow = true,
    startTransition,
    manualFiltering = true,
    persistPageSizeKey,
    ...tableProps
  } = props;

  const queryStateOptions = React.useMemo<Omit<UseQueryStateOptions<string>, 'parse'>>(
    () => ({
      history,
      scroll,
      shallow,
      throttleMs,
      debounceMs,
      clearOnDefault,
      startTransition,
    }),
    [history, scroll, shallow, throttleMs, debounceMs, clearOnDefault, startTransition],
  );

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>(
    initialState?.rowSelection ?? {},
  );
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>(
    initialState?.columnVisibility ?? {},
  );

  const [page, setPage] = useQueryState(
    PAGE_KEY,
    parseAsInteger.withOptions(queryStateOptions).withDefault(1),
  );
  const [perPage, setPerPage] = useQueryState(
    PER_PAGE_KEY,
    parseAsInteger
      .withOptions(queryStateOptions)
      .withDefault(initialState?.pagination?.pageSize ?? DEFAULT_PAGE_SIZE),
  );

  const pagination: PaginationState = React.useMemo(() => {
    return {
      pageIndex: page - 1,
      pageSize: perPage,
    };
  }, [page, perPage]);

  const onPaginationChange = React.useCallback(
    (updaterOrValue: Updater<PaginationState>) => {
      const next =
        typeof updaterOrValue === 'function' ? updaterOrValue(pagination) : updaterOrValue;
      void setPage(next.pageIndex + 1);
      void setPerPage(next.pageSize);
      if (persistPageSizeKey !== undefined) {
        writePageSizeCookie(persistPageSizeKey, next.pageSize);
      }
    },
    [pagination, setPage, setPerPage, persistPageSizeKey],
  );

  const columnIds = React.useMemo(() => {
    return new Set(columns.map((column) => column.id).filter(Boolean) as string[]);
  }, [columns]);

  const [sorting, setSorting] = useQueryState(
    SORT_KEY,
    getSortingStateParser<TData>(columnIds)
      .withOptions(queryStateOptions)
      .withDefault(initialState?.sorting ?? []),
  );

  const onSortingChange = React.useCallback(
    (updaterOrValue: Updater<SortingState>) => {
      if (typeof updaterOrValue === 'function') {
        const newSorting = updaterOrValue(sorting);
        void setSorting(newSorting as ExtendedColumnSort<TData>[]);
      } else {
        void setSorting(updaterOrValue as ExtendedColumnSort<TData>[]);
      }
    },
    [sorting, setSorting],
  );

  const filterableColumns = React.useMemo(() => {
    return columns.filter((column) => column.enableColumnFilter === true);
  }, [columns]);

  const filterParsers = React.useMemo(() => {
    return filterableColumns.reduce<Record<string, SingleParser<string> | SingleParser<string[]>>>(
      (acc, column) => {
        if (column.meta?.options === undefined) {
          acc[column.id ?? ''] = parseAsString.withOptions(queryStateOptions);
        } else {
          acc[column.id ?? ''] = parseAsArrayOf(parseAsString, ARRAY_SEPARATOR).withOptions(
            queryStateOptions,
          );
        }
        return acc;
      },
      {},
    );
  }, [filterableColumns, queryStateOptions]);

  const [filterValues, setFilterValues] = useQueryStates(filterParsers);

  const debouncedSetFilterValues = useDebouncedCallback((values: typeof filterValues) => {
    void setPage(1);
    void setFilterValues(values);
  }, debounceMs);

  const initialColumnFilters: ColumnFiltersState = React.useMemo(() => {
    return Object.entries(filterValues).reduce<ColumnFiltersState>((filters, [key, value]) => {
      if (value !== null) {
        let processedValue;

        if (Array.isArray(value)) {
          processedValue = value;
        } else if (typeof value === 'string' && /[^a-zA-Z0-9]/.test(value)) {
          processedValue = value.split(/[^a-zA-Z0-9]+/).filter(Boolean);
        } else {
          processedValue = [value];
        }

        filters.push({
          id: key,
          value: processedValue,
        });
      }
      return filters;
    }, []);
  }, [filterValues]);

  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>(initialColumnFilters);

  const isFilterableColumn = React.useCallback(
    (filterId: string) => {
      return filterableColumns.some((column) => column.id === filterId);
    },
    [filterableColumns],
  );

  const processColumnFilters = React.useCallback(
    (prev: ColumnFiltersState, next: ColumnFiltersState) => {
      const filterUpdates: Record<string, string | string[] | null> = {};
      for (const filter of next) {
        if (filter.id !== '' && isFilterableColumn(filter.id)) {
          filterUpdates[filter.id] = filter.value as string | string[];
        }
      }
      for (const prevFilter of prev) {
        if (prevFilter.id !== '' && !next.some((filter) => filter.id === prevFilter.id)) {
          filterUpdates[prevFilter.id] = null;
        }
      }
      return { filterUpdates, next };
    },
    [isFilterableColumn],
  );

  const onColumnFiltersChange = React.useCallback(
    (updaterOrValue: Updater<ColumnFiltersState>) => {
      setColumnFilters((prev) => {
        const next = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue;
        const { filterUpdates, next: processedNext } = processColumnFilters(prev, next);
        debouncedSetFilterValues(filterUpdates);
        return processedNext;
      });
    },
    [debouncedSetFilterValues, processColumnFilters],
  );

  const table = useTable({
    ...tableProps,
    features: appTableFeatures,
    columns,
    initialState,
    pageCount,
    state: {
      pagination,
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    defaultColumn: {
      ...tableProps.defaultColumn,
      enableColumnFilter: false,
      enableSorting: false,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onPaginationChange,
    onSortingChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: true,
    manualSorting: true,
    manualFiltering,
  });

  return { table, shallow, debounceMs, throttleMs };
};
