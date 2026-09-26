import { DataTableSkeleton } from '@/components/skeletons';

export default function Loading() {
  return <DataTableSkeleton actionCount={4} columnCount={11} filterCount={5} />;
}
