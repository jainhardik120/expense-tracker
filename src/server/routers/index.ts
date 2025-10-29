import { createCallerFactory, createTRPCRouter } from '@/server/trpc';

import { accountsRouter } from './accounts';
import { bulkImportRouter } from './bulk-import';
import { friendsRouter } from './friends';
import { statementsRouter } from './statements';
import { summaryRouter } from './summary';

import type { inferRouterOutputs, inferRouterInputs } from '@trpc/server';

export const appRouter = createTRPCRouter({
  accounts: accountsRouter,
  friends: friendsRouter,
  statements: statementsRouter,
  summary: summaryRouter,
  bulkImport: bulkImportRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);
