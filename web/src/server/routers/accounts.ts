import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { bankAccount, creditCardAccounts } from '@/db/schema';
import {
  assertOwnsAccountsAndFriends,
  getAccounts,
  getCreditCards,
} from '@/server/helpers/account';
import { verifyCreditCardAccount } from '@/server/helpers/emi';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  amount,
  createAccountSchema,
  createCreditCardAccountSchema,
  creditCardBillingDateSchema,
} from '@/types';

export const accountsRouter = createTRPCRouter({
  getAccounts: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/accounts',
      },
    })
    .input(z.void())
    .output(
      z.array(
        z.object({
          id: z.string(),
          userId: z.string(),
          startingBalance: z.string(),
          accountName: z.string(),
          createdAt: z.date().nullable(),
        }),
      ),
    )
    .query(({ ctx }) => {
      return getAccounts(ctx.db, ctx.user.id);
    }),
  createAccount: protectedProcedure.input(createAccountSchema).mutation(({ ctx, input }) => {
    return ctx.db.insert(bankAccount).values({
      userId: ctx.user.id,
      ...input,
    });
  }),
  deleteAccount: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(bankAccount)
        .where(and(eq(bankAccount.id, input.id), eq(bankAccount.userId, ctx.user.id)));
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
        .where(and(eq(bankAccount.id, input.id), eq(bankAccount.userId, ctx.user.id)))
        .returning({ id: bankAccount.id });
    }),
  getCreditCards: protectedProcedure.query(async ({ ctx }) => {
    return getCreditCards(ctx.db, ctx.user.id);
  }),
  createCreditCard: protectedProcedure
    .input(createCreditCardAccountSchema)
    .mutation(async ({ ctx, input }) => {
      await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, { accountIds: [input.accountId] });
      return ctx.db
        .insert(creditCardAccounts)
        .values({
          accountId: input.accountId,
          cardLimit: input.cardLimit,
          billingDate: input.billingDate,
        })
        .returning();
    }),
  updateCreditCard: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        accountId: z.string(),
        cardLimit: amount,
        billingDate: creditCardBillingDateSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, { accountIds: [input.accountId] });
      await verifyCreditCardAccount(ctx.db, ctx.user.id, input.id);
      const result = await ctx.db
        .update(creditCardAccounts)
        .set({
          accountId: input.accountId,
          cardLimit: input.cardLimit,
          billingDate: input.billingDate,
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
      await verifyCreditCardAccount(ctx.db, ctx.user.id, input.id);
      return ctx.db.delete(creditCardAccounts).where(eq(creditCardAccounts.id, input.id));
    }),
});
