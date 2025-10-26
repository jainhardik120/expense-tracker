import { type ReactNode, Suspense, use } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { ErrorBoundary } from './error-boundary';

type AsyncComponentProps<T> = {
  promise: Promise<T>;
  loadingFallback?: ReactNode;
  loadingFallbackClassName?: string;
  errorFallback?: (error: Error) => ReactNode;
  errorFallbackClassName?: string;
  children: (data: T) => ReactNode;
};

const AsyncRenderer = <T,>({
  promise,
  children,
}: Readonly<{ promise: Promise<T>; children: (data: T) => ReactNode }>) => {
  const data = use(promise);
  return <>{children(data)}</>;
};

export const AsyncComponent = <T,>({
  promise,
  loadingFallback,
  loadingFallbackClassName,
  errorFallback,
  errorFallbackClassName,
  children,
}: Readonly<AsyncComponentProps<T>>) => {
  const defaultFallback = (
    <Skeleton className={cn('h-full min-h-[400px]', loadingFallbackClassName)} />
  );

  return (
    <ErrorBoundary
      fallback={errorFallback}
      fallbackClassName={errorFallbackClassName ?? loadingFallbackClassName}
    >
      <Suspense fallback={loadingFallback ?? defaultFallback}>
        <AsyncRenderer promise={promise}>{children}</AsyncRenderer>
      </Suspense>
    </ErrorBoundary>
  );
};
