import 'server-only';

import { cache } from 'react';

import { headers } from 'next/headers';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { createHydrationHelpers } from '@trpc/react-query/rsc';
import {
  createTRPCOptionsProxy,
  type ResolverDef,
  type TRPCQueryOptions,
} from '@trpc/tanstack-react-query';

import { createQueryClient } from '@/server';
import { appRouter, createCaller, type AppRouter } from '@/server/routers';
import { createTRPCContext } from '@/server/trpc';

const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set('x-trpc-source', 'rsc');
  return createTRPCContext({
    headers: heads,
    setHeader: async () => {},
  });
});

const getQueryClient = cache(createQueryClient);
const caller = createCaller(createContext);

export const { trpc: api } = createHydrationHelpers<AppRouter>(caller, getQueryClient);

const trpc = createTRPCOptionsProxy({
  ctx: createContext,
  router: appRouter,
  queryClient: getQueryClient,
});

export const HydrateClient = (props: { children: React.ReactNode }) => {
  const queryClient = getQueryClient();
  return <HydrationBoundary state={dehydrate(queryClient)}>{props.children}</HydrationBoundary>;
};

export const prefetch = <S extends ResolverDef, T extends ReturnType<TRPCQueryOptions<S>>>(
  queryOptions: (trpcInstance: typeof trpc) => T,
) => {
  void getQueryClient()
    .query(queryOptions(trpc))
    .catch(() => undefined);
};
