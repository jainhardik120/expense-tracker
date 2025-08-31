import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { bankAccount } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createAccountSchema } from '@/types';

export const accountsRouter = createTRPCRouter({
  getAccounts: protectedProcedure.query(({ ctx }) => {
    return ctx.db
      .select()
      .from(bankAccount)
      .where(eq(bankAccount.userId, ctx.session.user.id))
      .orderBy(bankAccount.accountName);
  }),
  createAccount: protectedProcedure.input(createAccountSchema).mutation(({ ctx, input }) => {
    return ctx.db.insert(bankAccount).values({
      userId: ctx.session.user.id,
      ...input,
    });
  }),
  deleteAccount: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(bankAccount)
        .where(and(eq(bankAccount.id, input.id), eq(bankAccount.userId, ctx.session.user.id)));
    }),
  updateAccount: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        createAccountSchema,
      }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db
        .update(bankAccount)
        .set(input.createAccountSchema)
        .where(and(eq(bankAccount.id, input.id), eq(bankAccount.userId, ctx.session.user.id)))
        .returning({ id: bankAccount.id });
    }),
});
