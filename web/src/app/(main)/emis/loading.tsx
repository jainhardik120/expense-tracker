import { DataTableSkeleton } from '@/components/skeletons';

export default function Loading() {
  return <DataTableSkeleton actionCount={2} columnCount={13} />;
}
