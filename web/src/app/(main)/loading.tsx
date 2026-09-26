import { FullAreaSkeleton } from '@/components/skeletons';

/**
 * The fallback for any page in the group that has not described its own shape.
 *
 * Beyond showing something during navigation, a boundary is what makes a
 * prefetch cheap: with none Next has to render the whole page to satisfy one,
 * so a prefetched route runs all of its queries. With a boundary it prefetches
 * the shell and stops, and the data is only fetched once you actually
 * navigate. Every route here should carry a `loading.tsx` that mirrors its own
 * layout; this deliberately claims no structure at all rather than promising
 * one the page will not have.
 */
export default function Loading() {
  return <FullAreaSkeleton />;
}
