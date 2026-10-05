import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { accountBalanceChecks } from '@/db/schema';
import { assertOwnsAccountsAndFriends } from '@/server/helpers/account';
import { getBalanceChecks } from '@/server/helpers/balance-checks';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { balanceCheckSchema } from '@/types';

const DUPLICATE_CHECK = 'account_balance_checks_account_time_idx';

const friendlyDuplicate = (error: unknown): never => {
  const cause: unknown = error instanceof Error ? error.cause : undefined;
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'constraint' in cause &&
    cause.constraint === DUPLICATE_CHECK
  ) {
    throw new Error('This account already has a check at that exact time');
  }
  throw error;
};

export const balanceChecksRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(({ ctx }) => getBalanceChecks(ctx.db, ctx.user.id)),
  getWarnings: protectedProcedure.query(async ({ ctx }) =>
    (await getBalanceChecks(ctx.db, ctx.user.id))
      .filter((account) => account.status === 'mismatch')
      .map((account) => ({
        accountId: account.accountId,
        accountName: account.accountName,
        latestDifference: account.latestDifference,
        mismatchedChecks: account.mismatchedChecks,
        latestCheckAt: account.checks.at(0)?.checkedAt ?? null,
      })),
  ),
  createCheck: protectedProcedure.input(balanceCheckSchema).mutation(async ({ ctx, input }) => {
    await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, { accountIds: [input.accountId] });
    return ctx.db
      .insert(accountBalanceChecks)
      .values({ ...input, userId: ctx.user.id, note: input.note ?? null })
      .returning({ id: accountBalanceChecks.id })
      .catch(friendlyDuplicate);
  }),
  updateCheck: protectedProcedure
    .input(balanceCheckSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, { accountIds: [fields.accountId] });
      return ctx.db
        .update(accountBalanceChecks)
        .set({ ...fields, note: fields.note ?? null })
        .where(and(eq(accountBalanceChecks.id, id), eq(accountBalanceChecks.userId, ctx.user.id)))
        .returning({ id: accountBalanceChecks.id })
        .catch(friendlyDuplicate);
    }),
  deleteCheck: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(accountBalanceChecks)
        .where(
          and(eq(accountBalanceChecks.id, input.id), eq(accountBalanceChecks.userId, ctx.user.id)),
        );
    }),
});
