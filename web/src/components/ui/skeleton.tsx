import { cn } from '@/lib/utils';

const Skeleton = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    className={cn('bg-accent animate-pulse rounded-xl border shadow-sm', className)}
    data-slot="skeleton"
    {...props}
  />
);

export { Skeleton };
