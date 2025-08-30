import { createCallerFactory, createTRPCRouter } from '@/server/trpc';

import { accountsRouter } from './accounts';

export const appRouter = createTRPCRouter({
  accounts: accountsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
