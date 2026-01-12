import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { bankAccount, creditCardAccounts } from '@/db/schema';
import { getAccounts, getCreditCards } from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { amount, createAccountSchema, createCreditCardAccountSchema } from '@/types';

const CREDIT_CARD_NOT_FOUND = 'Credit card not found or access denied';

export const accountsRouter = createTRPCRouter({
  getAccounts: protectedProcedure.query(({ ctx }) => {
    return getAccounts(ctx.db, ctx.session.user.id);
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
  getCreditCards: protectedProcedure.query(async ({ ctx }) => {
    return getCreditCards(ctx.db, ctx.session.user.id);
  }),
  createCreditCard: protectedProcedure
    .input(createCreditCardAccountSchema)
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.db
        .select({ id: bankAccount.id })
        .from(bankAccount)
        .where(
          and(eq(bankAccount.id, input.accountId), eq(bankAccount.userId, ctx.session.user.id)),
        )
        .limit(1);
      if (account.length === 0) {
        throw new Error('Account not found or access denied');
      }
      return ctx.db
        .insert(creditCardAccounts)
        .values({
          accountId: input.accountId,
          cardLimit: input.cardLimit,
        })
        .returning();
    }),
  updateCreditCard: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        accountId: z.string(),
        cardLimit: amount,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.db
        .select({ id: bankAccount.id })
        .from(bankAccount)
        .where(
          and(eq(bankAccount.id, input.accountId), eq(bankAccount.userId, ctx.session.user.id)),
        )
        .limit(1);
      if (account.length === 0) {
        throw new Error('Account not found or access denied');
      }
      const result = await ctx.db
        .update(creditCardAccounts)
        .set({
          accountId: input.accountId,
          cardLimit: input.cardLimit,
        })
        .where(eq(creditCardAccounts.id, input.id))
        .returning({ id: creditCardAccounts.id });
      if (result.length === 0) {
        throw new Error('Credit card not found');
      }
      return result;
    }),
  deleteCreditCard: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const creditCard = await ctx.db
        .select({ accountId: creditCardAccounts.accountId })
        .from(creditCardAccounts)
        .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
        .where(
          and(eq(creditCardAccounts.id, input.id), eq(bankAccount.userId, ctx.session.user.id)),
        )
        .limit(1);
      if (creditCard.length === 0) {
        throw new Error(CREDIT_CARD_NOT_FOUND);
      }
      return ctx.db.delete(creditCardAccounts).where(eq(creditCardAccounts.id, input.id));
    }),
});
