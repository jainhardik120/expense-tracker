import { CardSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

const SUMMARY_CARDS = ['received', 'projected-net', 'taxable', 'tax'];

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SUMMARY_CARDS.map((card) => (
          <CardSkeleton key={card} bodyHeight="h-8" lines={2} />
        ))}
      </div>
      <CardSkeleton bodyHeight="h-72" lines={2} />
      <CardSkeleton bodyHeight="h-96" lines={2} />
    </div>
  );
}
