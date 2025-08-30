import { eq } from 'drizzle-orm';

import { bankAccount } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createAccountSchema } from '@/types';

export const accountsRouter = createTRPCRouter({
  getAccounts: protectedProcedure.query(({ ctx }) => {
    return ctx.db.select().from(bankAccount).where(eq(bankAccount.userId, ctx.session.user.id));
  }),
  createAccount: protectedProcedure.input(createAccountSchema).mutation(({ ctx, input }) => {
    return ctx.db.insert(bankAccount).values({
      userId: ctx.session.user.id,
      startingBalance: input.startingBalance.toString(),
      accountName: input.accountName,
    });
  }),
});
