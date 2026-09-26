import { createCallerFactory, createTRPCRouter } from '@/server/trpc';

import { accountsRouter } from './accounts';
import { adminRouter } from './admin';
import { budgetRouter } from './budget';
import { bulkImportRouter } from './bulk-import';
import { emisRouter } from './emis';
import { friendsRouter } from './friends';
import { investmentsRouter } from './investments';
import { recurringPaymentsRouter } from './recurring-payments';
import { reportsRouter } from './reports';
import { salaryRouter } from './salary';
import { smsNotificationsRouter } from './sms-notifications';
import { statementsRouter } from './statements';
import { summaryRouter } from './summary';

import type { inferRouterOutputs } from '@trpc/server';

export const appRouter = createTRPCRouter({
  accounts: accountsRouter,
  admin: adminRouter,
  friends: friendsRouter,
  statements: statementsRouter,
  summary: summaryRouter,
  budget: budgetRouter,
  bulkImport: bulkImportRouter,
  investments: investmentsRouter,
  emis: emisRouter,
  recurringPayments: recurringPaymentsRouter,
  reports: reportsRouter,
  salary: salaryRouter,
  smsNotifications: smsNotificationsRouter,
});

export type AppRouter = typeof appRouter;
export type RouterOutput = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);
