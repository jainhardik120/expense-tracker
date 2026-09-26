import { CardSkeleton, DataTableSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

const SUMMARY_CARDS = ['invested', 'value', 'pnl', 'day-change', 'positions'];

export default function Loading() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {SUMMARY_CARDS.map((card) => (
            <CardSkeleton key={card} bodyHeight="h-7" />
          ))}
        </div>
        <CardSkeleton bodyHeight="h-[26rem]" lines={2} />
      </div>
      {/* The per-kind market data status line. */}
      <Skeleton className="mx-1 h-3.5 w-2/3" />
      <DataTableSkeleton columnCount={13} filterCount={1} rowCount={8} withPagination={false} />
      <DataTableSkeleton actionCount={2} columnCount={13} />
    </div>
  );
}
