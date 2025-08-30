import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { loggerLink, httpBatchStreamLink } from '@trpc/client';
import { SuperJSON } from 'superjson';

import { getBaseUrl } from '@/lib/getBaseUrl';

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query): boolean =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });

export const links = [
  loggerLink({
    enabled: (op) =>
      process.env.NODE_ENV === 'development' ||
      (op.direction === 'down' && op.result instanceof Error),
  }),
  httpBatchStreamLink({
    transformer: SuperJSON,
    url: `${getBaseUrl()}/api/trpc`,
    headers: () => {
      const headers = new Headers();
      headers.set('x-trpc-source', 'nextjs-react');

      return headers;
    },
  }),
];
