import { Skeleton } from '@/components/ui/skeleton';

/**
 * A loading boundary for every page in the group.
 *
 * Beyond showing something during navigation, this is what makes a prefetch
 * cheap: with no boundary Next has to render the whole page to satisfy one, so
 * a prefetched route runs all of its queries. With a boundary it prefetches the
 * shell and stops, and the data is only fetched once you actually navigate.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
