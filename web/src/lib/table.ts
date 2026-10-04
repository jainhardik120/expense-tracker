import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrIncludes,
  filterFn_arrIncludesSome,
  filterFn_equals,
  filterFn_inNumberRange,
  filterFn_includesString,
  filterFn_weakEquals,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type Cell as TanstackCell,
  type Column as TanstackColumn,
  type ColumnDef as TanstackColumnDef,
  type Header as TanstackHeader,
  type Row as TanstackRow,
  type RowData,
  type TableOptions as TanstackTableOptions,
  type Table as TanstackTable,
  type TableState as TanstackTableState,
  type ReactTable,
} from '@tanstack/react-table';

export const appTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnFacetingFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnResizingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  filterFns: {
    includesString: filterFn_includesString,
    inNumberRange: filterFn_inNumberRange,
    equals: filterFn_equals,
    weakEquals: filterFn_weakEquals,
    arrIncludes: filterFn_arrIncludes,
    arrIncludesSome: filterFn_arrIncludesSome,
  },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
    datetime: sortFn_datetime,
    basic: sortFn_basic,
  },
});

export type AppTableFeatures = typeof appTableFeatures;

export type ColumnDef<TData extends RowData, TValue = unknown> = TanstackColumnDef<
  AppTableFeatures,
  TData,
  TValue
>;
export type Table<TData extends RowData> = ReactTable<AppTableFeatures, TData>;
export type CoreTable<TData extends RowData> = TanstackTable<AppTableFeatures, TData>;
export type Row<TData extends RowData> = TanstackRow<AppTableFeatures, TData>;
export type Column<TData extends RowData, TValue = unknown> = TanstackColumn<
  AppTableFeatures,
  TData,
  TValue
>;
export type Cell<TData extends RowData, TValue = unknown> = TanstackCell<
  AppTableFeatures,
  TData,
  TValue
>;
export type Header<TData extends RowData, TValue = unknown> = TanstackHeader<
  AppTableFeatures,
  TData,
  TValue
>;
export type TableOptions<TData extends RowData> = TanstackTableOptions<AppTableFeatures, TData>;
export type TableState = TanstackTableState<AppTableFeatures>;
