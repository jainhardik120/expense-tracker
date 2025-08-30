import { type NextRequest } from 'next/server';

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter } from '@/server/routers';
import { createTRPCContext } from '@/server/trpc';

const createContext = (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError: ({ path, error }) => {
      // eslint-disable-next-line no-console
      console.error(`❌ tRPC failed on ${path ?? '<no-path>'}: ${error.message}`);
    },
  });

export { handler as GET, handler as POST };
