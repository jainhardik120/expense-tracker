import { cn } from '@/lib/utils';

const Skeleton = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="skeleton"
    className={cn('bg-accent animate-pulse rounded-xl border shadow-sm', className)}
    {...props}
  />
);

export { Skeleton };
