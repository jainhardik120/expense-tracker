'use client';

import { useState } from 'react';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createTRPCReact } from '@trpc/react-query';

import { createQueryClient, links } from '@/server';
import { type AppRouter } from '@/server/routers';

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = (): QueryClient => {
  if (typeof window === 'undefined') {
    return createQueryClient();
  }
  clientQueryClientSingleton ??= createQueryClient();
  return clientQueryClientSingleton;
};

const config = {
  links: links,
};

export const api = createTRPCReact<AppRouter>();

export const TRPCReactProvider = (props: { readonly children: React.ReactNode }) => {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() => api.createClient(config));

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
};
