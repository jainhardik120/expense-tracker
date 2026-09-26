import { CardSkeleton, DataTableSkeleton } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <DataTableSkeleton actionCount={4} columnCount={7} rowCount={12} withPagination={false} />
      <div className="flex flex-col gap-4">
        {/* The from/to boundary pickers, then the rendered report. */}
        <CardSkeleton bodyHeight="h-10" lines={0} />
        <CardSkeleton bodyHeight="h-[28rem]" />
      </div>
    </div>
  );
}
