import { CardSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

const LOAN_FIELDS = ['mode', 'amount', 'rate', 'tenure', 'gst', 'fees', 'fees-gst'];

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-xl border p-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
          {LOAN_FIELDS.map((field) => (
            <div key={field} className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <CardSkeleton bodyHeight="h-56" />
      </div>
      <CardSkeleton bodyHeight="h-72" lines={2} />
    </div>
  );
}
