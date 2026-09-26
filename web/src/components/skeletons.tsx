import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/**
 * Fills the whole content area, edge to edge.
 *
 * The layout pads its children by 4; a page whose shape is too bespoke to
 * mirror cancels that padding rather than showing a skeleton that implies a
 * structure the page does not have.
 */
export const FullAreaSkeleton = () => <Skeleton className="-m-4 flex-1 rounded-none" />;

/**
 * The shape of a `DataTable`: toolbar, bordered table, pagination row. Every
 * measurement here tracks the real components, so the skeleton and the table
 * that replaces it occupy the same space.
 */
export const DataTableSkeleton = ({
  columnCount,
  rowCount = 10,
  filterCount = 0,
  actionCount = 0,
  withPagination = true,
}: {
  columnCount: number;
  rowCount?: number;
  filterCount?: number;
  actionCount?: number;
  withPagination?: boolean;
}) => (
  <div className="flex w-full flex-col gap-2.5 overflow-auto">
    {filterCount + actionCount > 0 ? (
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {range(filterCount).map((index) => (
            <Skeleton key={index} className="h-8 w-28 rounded-md" />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {range(actionCount).map((index) => (
            <Skeleton key={index} className="h-8 w-24 rounded-md" />
          ))}
        </div>
      </div>
    ) : null}
    <div className="overflow-hidden rounded-md border">
      <div className="flex h-10 items-center gap-4 border-b px-2">
        {range(columnCount).map((index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      {range(rowCount).map((row) => (
        <div key={row} className="flex h-10 items-center gap-4 border-b px-2 last:border-b-0">
          {range(columnCount).map((column) => (
            <Skeleton key={column} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
    {withPagination ? (
      <div className="flex w-full flex-col-reverse items-center justify-between gap-4 p-1 sm:flex-row sm:gap-8">
        <Skeleton className="h-4 w-40" />
        <div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
    ) : null}
  </div>
);

/** A `Card` with a title line and a body of the given height. */
export const CardSkeleton = ({
  bodyHeight = 'h-40',
  className,
  lines = 1,
}: {
  bodyHeight?: string;
  className?: string;
  lines?: number;
}) => (
  <div className={cn('flex flex-col gap-4 rounded-xl border p-6', className)}>
    {range(lines).map((line) => (
      <Skeleton key={line} className={line === 0 ? 'h-4 w-40' : 'h-3.5 w-24'} />
    ))}
    <Skeleton className={cn('w-full', bodyHeight)} />
  </div>
);
