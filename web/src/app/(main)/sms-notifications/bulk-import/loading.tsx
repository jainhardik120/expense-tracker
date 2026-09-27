import { DataTableSkeleton } from '@/components/skeletons';

export default function Loading() {
  return <DataTableSkeleton actionCount={1} columnCount={10} filterCount={0} />;
}
