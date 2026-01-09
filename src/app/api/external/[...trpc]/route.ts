import { createOpenApiFetchHandler } from 'trpc-to-openapi';

import { appRouter } from '@/server/routers';
import { createTRPCContextNext } from '@/server/trpc';

const handler = (req: Request) => {
  return createOpenApiFetchHandler({
    endpoint: '/api/external',
    router: appRouter,
    createContext: createTRPCContextNext,
    req,
  });
};

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
  handler as HEAD,
};
