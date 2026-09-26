import { DataTableSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

const SESSION_ROWS = ['one', 'two', 'three'];

export default function Loading() {
  return (
    <>
      <DataTableSkeleton actionCount={1} columnCount={2} rowCount={2} withPagination={false} />
      <Skeleton className="h-9 w-full" />
      <div className="flex w-max flex-col gap-1 border-l-2 px-2">
        <Skeleton className="h-3.5 w-24" />
        {SESSION_ROWS.map((row) => (
          <Skeleton key={row} className="h-5 w-56" />
        ))}
      </div>
    </>
  );
}
