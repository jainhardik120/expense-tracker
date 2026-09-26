import { CardSkeleton, DataTableSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

const CHART_CARD_BODY = 'h-[22rem]';

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Period select, both date inputs, month select. */}
      <div className="flex flex-row flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CardSkeleton bodyHeight={CHART_CARD_BODY} lines={2} />
        <CardSkeleton bodyHeight={CHART_CARD_BODY} />
        <CardSkeleton bodyHeight={CHART_CARD_BODY} />
      </div>
      <DataTableSkeleton actionCount={3} columnCount={9} rowCount={8} withPagination={false} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CardSkeleton bodyHeight="h-56" />
        <CardSkeleton bodyHeight="h-56" />
        <CardSkeleton bodyHeight="h-56" />
      </div>
      <DataTableSkeleton columnCount={6} rowCount={8} withPagination={false} />
    </div>
  );
}
