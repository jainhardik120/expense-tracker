'use client';

import { useState } from 'react';

import {
  QueryClientProvider,
  type QueryKey,
  type QueryClient,
  type DefaultError,
  type UndefinedInitialDataOptions,
  useQuery,
} from '@tanstack/react-query';
import { createTRPCReact } from '@trpc/react-query';
import { createTRPCContext } from '@trpc/tanstack-react-query';

import { createQueryClient, links } from '@/server';
import { type AppRouter } from '@/server/routers';

const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = (): QueryClient => {
  if (typeof window === 'undefined') {
    return createQueryClient();
  }
  clientQueryClientSingleton ??= createQueryClient();
  return clientQueryClientSingleton;
};
export const api = createTRPCReact<AppRouter>();

export const TRPCReactProvider = (props: { readonly children: React.ReactNode }) => {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    api.createClient({
      links,
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <api.Provider client={trpcClient} queryClient={queryClient}>
          {props.children}
        </api.Provider>
      </TRPCProvider>
    </QueryClientProvider>
  );
};

export const useTRPCQuery = <
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: (
    api: ReturnType<typeof useTRPC>,
  ) => UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
) => {
  const trpc = useTRPC();
  const queryOptions = options(trpc);
  return useQuery(queryOptions);
};
