import { type RowData } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Table } from '@/lib/table';
import { cn } from '@/lib/utils';

const PAGE_SIZE_STEP = 10;
const PAGE_SIZE_OPTION_COUNT = 5;
const DEFAULT_PAGE_SIZE_OPTIONS = Array.from(
  { length: PAGE_SIZE_OPTION_COUNT },
  (_, index) => (index + 1) * PAGE_SIZE_STEP,
);

interface DataTablePaginationProps<TData extends RowData> extends React.ComponentProps<'div'> {
  table: Table<TData>;
  pageSizeOptions?: number[];
  enableSelection?: boolean;
  status?: React.ReactNode;
}

export const DataTablePagination = <TData extends RowData>({
  table,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
  enableSelection = true,
  status,
  ...props
}: DataTablePaginationProps<TData>) => (
  <div
    className={cn(
      'flex w-full flex-col-reverse flex-wrap items-center justify-between gap-4 p-1 sm:flex-row sm:gap-8',
      className,
    )}
    {...props}
  >
    <div className="text-muted-foreground flex-1 text-sm whitespace-nowrap">
      {status ??
        (enableSelection === true && table.getFilteredSelectedRowModel().rows.length > 0 ? (
          <>
            {table.getFilteredSelectedRowModel().rows.length} of{' '}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </>
        ) : null)}
    </div>
    <div className="flex flex-col-reverse flex-wrap items-center justify-end gap-4 sm:flex-row sm:gap-6 lg:gap-8">
      <div className="flex items-center space-x-2">
        <p className="text-sm font-medium whitespace-nowrap">Rows per page</p>
        <Select
          value={`${table.state.pagination.pageSize}`}
          onValueChange={(value) => {
            table.setPageSize(Number(value));
          }}
        >
          <SelectTrigger className="h-8 w-[4.5rem] [&[data-size]]:h-8">
            <SelectValue placeholder={table.state.pagination.pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {pageSizeOptions.map((pageSize) => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-center text-sm font-medium">
        Page {table.state.pagination.pageIndex + 1} of {table.getPageCount()}
      </div>
      <div className="flex items-center space-x-2">
        <Button
          aria-label="Go to first page"
          className="hidden size-8 lg:flex"
          disabled={!table.getCanPreviousPage()}
          size="icon"
          variant="outline"
          onClick={() => {
            table.setPageIndex(0);
          }}
        >
          <ChevronsLeft />
        </Button>
        <Button
          aria-label="Go to previous page"
          className="size-8"
          disabled={!table.getCanPreviousPage()}
          size="icon"
          variant="outline"
          onClick={() => {
            table.previousPage();
          }}
        >
          <ChevronLeft />
        </Button>
        <Button
          aria-label="Go to next page"
          className="size-8"
          disabled={!table.getCanNextPage()}
          size="icon"
          variant="outline"
          onClick={() => {
            table.nextPage();
          }}
        >
          <ChevronRight />
        </Button>
        <Button
          aria-label="Go to last page"
          className="hidden size-8 lg:flex"
          disabled={!table.getCanNextPage()}
          size="icon"
          variant="outline"
          onClick={() => {
            table.setPageIndex(table.getPageCount() - 1);
          }}
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
  </div>
);
