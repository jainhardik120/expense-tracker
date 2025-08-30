// eslint-disable-next-line import/no-unassigned-import
import 'server-only';

import { cache } from 'react';

import { headers } from 'next/headers';

import { createHydrationHelpers } from '@trpc/react-query/rsc';

import { createQueryClient } from '@/server';
import { createCaller, type AppRouter } from '@/server/routers';
import { createTRPCContext } from '@/server/trpc';

const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set('x-trpc-source', 'rsc');
  return createTRPCContext({
    headers: heads,
  });
});

const getQueryClient = cache(createQueryClient);
const caller = createCaller(createContext);

export const { trpc: api } = createHydrationHelpers<AppRouter>(caller, getQueryClient);
