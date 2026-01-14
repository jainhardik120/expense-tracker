import { cookies } from 'next/headers';

import { endOfMonth } from 'date-fns';
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { z } from 'zod';

import { bankAccount, creditCardAccounts, emis, statements } from '@/db/schema';
import { getEMIs, getMaxInstallmentNoSubquery } from '@/server/helpers/emi';
import {
  calculateEMIAndPrincipal,
  calculateSchedule,
  confirmMatch,
  getEMIBalances,
  parseFloatSafe,
  calculateCardBalances,
  groupPaymentsByMonth,
} from '@/server/helpers/emi-calculations';
import { getCreditCards } from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  createEmiSchema,
  emiParserSchema,
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
  TIMEZONE_COOKIE,
} from '@/types';

const EMI_NOT_FOUND = 'EMI not found or access denied';
const STATEMENT_NOT_LINKED = 'Statement is not linked to an EMI';
export const emisRouter = createTRPCRouter({
  getEmis: protectedProcedure.input(emiParserSchema).query(async ({ ctx, input }) => {
    const conditions = [eq(emis.userId, ctx.session.user.id)];
    const [{ count }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(emis)
      .where(and(...conditions));
    const emisList = await getEMIs(ctx.db, ctx.session.user.id, input);
    const emisWithCalculations = emisList.map((emi) => {
      const installmentNo =
        emi.maxInstallmentNo === null ? null : parseFloatSafe(emi.maxInstallmentNo);
      const balances = getEMIBalances(emi, installmentNo);
      return {
        ...emi,
        ...balances,
      };
    });
    const pageCount = Math.ceil(count / input.perPage);
    return {
      emis: emisWithCalculations,
      pageCount,
      rowsCount: count,
    };
  }),
  addEmi: protectedProcedure.input(createEmiSchema).mutation(async ({ ctx, input }) => {
    const creditCard = await ctx.db
      .select({ id: creditCardAccounts.id })
      .from(creditCardAccounts)
      .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
      .where(
        and(eq(creditCardAccounts.id, input.creditId), eq(bankAccount.userId, ctx.session.user.id)),
      )
      .limit(1);

    if (creditCard.length === 0) {
      throw new Error('Credit card not found or access denied');
    }

    const tenure = parseFloatSafe(input.tenure);
    const annualRate = parseFloatSafe(input.annualInterestRate);
    const monthlyRate = annualRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

    const { principal } = calculateEMIAndPrincipal({
      calculationMode: input.calculationMode,
      monthlyRate,
      tenure: tenure,
      principal: parseFloatSafe(input.principal),
      emiAmount: parseFloatSafe(input.emiAmount),
      totalEmiAmount: parseFloatSafe(input.totalEmiAmount),
    });

    return ctx.db
      .insert(emis)
      .values({
        userId: ctx.session.user.id,
        ...{
          ...input,
          calculationMode: undefined,
          emiAmount: undefined,
          totalEmiAmount: undefined,
        },
        principal: principal.toFixed(2).toString(),
      })
      .returning({ id: emis.id });
  }),
  updateEmi: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        ...createEmiSchema.shape,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const creditCard = await ctx.db
        .select({ id: creditCardAccounts.id })
        .from(creditCardAccounts)
        .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
        .where(
          and(
            eq(creditCardAccounts.id, input.creditId),
            eq(bankAccount.userId, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (creditCard.length === 0) {
        throw new Error('Credit card not found or access denied');
      }
      const tenure = parseFloatSafe(input.tenure);
      const annualRate = parseFloatSafe(input.annualInterestRate);
      const monthlyRate = annualRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);
      const { principal } = calculateEMIAndPrincipal({
        calculationMode: input.calculationMode,
        monthlyRate,
        tenure: tenure,
        principal: parseFloatSafe(input.principal),
        emiAmount: parseFloatSafe(input.emiAmount),
        totalEmiAmount: parseFloatSafe(input.totalEmiAmount),
      });
      const { id, ...restInput } = input;
      const result = await ctx.db
        .update(emis)
        .set({
          name: restInput.name,
          creditId: restInput.creditId,
          principal: principal.toFixed(2).toString(),
          tenure: restInput.tenure,
          annualInterestRate: restInput.annualInterestRate,
          processingFees: restInput.processingFees,
          processingFeesGst: restInput.processingFeesGst,
          gst: restInput.gst,
          firstInstallmentDate: restInput.firstInstallmentDate,
          processingFeesDate: restInput.processingFeesDate,
          iafe: restInput.iafe,
        })
        .where(and(eq(emis.id, id), eq(emis.userId, ctx.session.user.id)))
        .returning({ id: emis.id });
      if (result.length === 0) {
        throw new Error(EMI_NOT_FOUND);
      }
      return result;
    }),
  deleteEmi: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(emis)
        .where(and(eq(emis.id, input.id), eq(emis.userId, ctx.session.user.id)))
        .returning({ id: emis.id });
      if (result.length === 0) {
        throw new Error(EMI_NOT_FOUND);
      }
      return result;
    }),
  unlinkStatement: protectedProcedure
    .input(
      z.object({
        statementId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const statement = await ctx.db
        .select({
          id: statements.id,
          accountId: statements.accountId,
          attributes: statements.additionalAttributes,
        })
        .from(statements)
        .where(
          and(eq(statements.id, input.statementId), eq(statements.userId, ctx.session.user.id)),
        )
        .limit(1);
      if (statement.length === 0) {
        throw new Error('Statement not found or access denied');
      }
      const attributes = statement[0].attributes as Partial<Record<string, unknown>>;
      if (attributes.emiId === undefined) {
        throw new Error(STATEMENT_NOT_LINKED);
      }
      const currentInstallmentNo =
        typeof attributes.installmentNo === 'number' ? attributes.installmentNo : null;
      if (currentInstallmentNo === null) {
        throw new Error('Statement does not have a valid installment number');
      }
      const emiId = attributes.emiId as string;
      const maxInstallmentQuery = getMaxInstallmentNoSubquery(ctx.db, ctx.session.user.id);
      const maxInstallment = await ctx.db
        .select({
          maxInstallmentNo: maxInstallmentQuery.maxInstallmentNo,
        })
        .from(maxInstallmentQuery)
        .where(eq(maxInstallmentQuery.emiId, emiId));
      if (maxInstallment.length === 0) {
        throw new Error(STATEMENT_NOT_LINKED);
      }
      const { maxInstallmentNo } = maxInstallment[0];
      if (maxInstallmentNo === null) {
        throw new Error(STATEMENT_NOT_LINKED);
      }
      if (currentInstallmentNo !== parseFloatSafe(maxInstallmentNo)) {
        throw new Error(
          `Cannot unlink installment ${currentInstallmentNo}. Only the last payment (installment ${maxInstallmentNo}) can be unlinked.`,
        );
      }
      await ctx.db
        .update(statements)
        .set({
          additionalAttributes: {
            ...attributes,
            emiId: undefined,
            installmentNo: undefined,
          },
        })
        .where(eq(statements.id, input.statementId));
      return { success: true };
    }),
  linkStatement: protectedProcedure
    .input(
      z.object({
        emiId: z.string(),
        statementId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const emiData = await ctx.db
        .select({
          accountId: creditCardAccounts.accountId,
          ...getTableColumns(emis),
        })
        .from(emis)
        .leftJoin(creditCardAccounts, eq(emis.creditId, creditCardAccounts.id))
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)))
        .limit(1);

      if (emiData.length === 0) {
        throw new Error(EMI_NOT_FOUND);
      }
      const emi = emiData[0];
      const statementData = await ctx.db
        .select({
          id: statements.id,
          accountId: statements.accountId,
          attributes: statements.additionalAttributes,
          amount: statements.amount,
          createdAt: statements.createdAt,
          statementKind: statements.statementKind,
        })
        .from(statements)
        .where(
          and(eq(statements.id, input.statementId), eq(statements.userId, ctx.session.user.id)),
        )
        .limit(1);
      if (statementData.length === 0) {
        throw new Error('Statement not found or access denied');
      }
      const statement = statementData[0];
      const attributes = statement.attributes as Partial<Record<string, unknown>>;
      if (attributes.emiId !== undefined) {
        throw new Error('Statement is already linked to an EMI');
      }
      const { schedule: payments } = calculateSchedule(emi);
      let lastInstallmentNo = -1;
      const maxInstallmentQuery = getMaxInstallmentNoSubquery(ctx.db, ctx.session.user.id);
      const maxInstallment = await ctx.db
        .select({
          maxInstallmentNo: maxInstallmentQuery.maxInstallmentNo,
        })
        .from(maxInstallmentQuery)
        .where(eq(maxInstallmentQuery.emiId, input.emiId));
      if (maxInstallment.length !== 0) {
        const { maxInstallmentNo } = maxInstallment[0];
        if (maxInstallmentNo !== null) {
          lastInstallmentNo = parseFloatSafe(maxInstallmentNo);
        }
      }
      const matchConfirmed = confirmMatch(
        payments,
        Math.abs(parseFloatSafe(statement.amount)),
        statement.createdAt,
        lastInstallmentNo + 1,
      );
      if (!matchConfirmed) {
        throw new Error('Statement does not match with the payments');
      }
      await ctx.db
        .update(statements)
        .set({
          additionalAttributes: {
            ...attributes,
            emiId: input.emiId,
            installmentNo: lastInstallmentNo + 1,
          },
        })
        .where(eq(statements.id, input.statementId));
      return {
        success: true,
        installmentNo: lastInstallmentNo + 1,
      };
    }),
  getLinkedStatements: protectedProcedure
    .input(
      z.object({
        emiId: z.string(),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.db
        .select({
          id: statements.id,
          accountId: statements.accountId,
          attributes: statements.additionalAttributes,
          amount: statements.amount,
          createdAt: statements.createdAt,
        })
        .from(statements)
        .where(
          and(
            eq(statements.userId, ctx.session.user.id),
            eq(sql`${statements.additionalAttributes}->>'emiId'`, input.emiId),
          ),
        )
        .orderBy(desc(statements.createdAt));
    }),
  getCreditCardsWithOutstandingBalance: protectedProcedure.query(async ({ ctx }) => {
    const cards = await getCreditCards(ctx.db, ctx.session.user.id);
    const pendingEMIs = await getEMIs(ctx.db, ctx.session.user.id, {
      completed: false,
      perPage: 100,
      page: 1,
      accountId: [],
      creditId: [],
    });
    const timezone = (await cookies()).get(TIMEZONE_COOKIE)?.value ?? 'UTC';
    const currentMonthPayments: {
      emiId: string;
      emiName: string;
      cardName: string;
      amount: number;
      date: Date;
    }[] = [];
    const futurePayments: {
      emiId: string;
      emiName: string;
      cardName: string;
      amount: number;
      date: Date;
      month: string;
    }[] = [];
    const monthEnd = endOfMonth(new Date());

    const cardDetails: Record<
      string,
      {
        outstandingBalance: number;
        currentStatement: number;
      }
    > = {};

    for (const card of cards) {
      const cardId = card.id;
      const pendingEMI = pendingEMIs.filter((emi) => emi.creditId === cardId);

      const {
        outstandingBalance,
        currentStatement,
        currentMonthPayments: cardCurrentPayments,
        futurePayments: cardFuturePayments,
      } = calculateCardBalances(pendingEMI, monthEnd, timezone, card.accountName);

      cardDetails[cardId] = {
        outstandingBalance,
        currentStatement,
      };

      currentMonthPayments.push(...cardCurrentPayments);
      futurePayments.push(...cardFuturePayments);
    }

    const paymentsByMonth = groupPaymentsByMonth(futurePayments);

    return {
      cards,
      cardDetails,
      currentMonthPayments,
      paymentsByMonth,
    };
  }),
  getEmiSplits: protectedProcedure
    .input(z.object({ emiId: z.string() }))
    .query(async ({ ctx, input }) => {
      const emiData = await ctx.db
        .select({
          additionalAttributes: emis.additionalAttributes,
        })
        .from(emis)
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)))
        .limit(1);

      if (emiData.length === 0) {
        throw new Error(EMI_NOT_FOUND);
      }

      const attributes = emiData[0].additionalAttributes as Record<string, unknown>;
      const splits =
        attributes.splits !== undefined
          ? (attributes.splits as Array<{ friendId: string; percentage: string }>)
          : [];

      return splits;
    }),
  addEmiSplit: protectedProcedure
    .input(
      z.object({
        emiId: z.string(),
        friendId: z.string(),
        percentage: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const emiData = await ctx.db
        .select({
          additionalAttributes: emis.additionalAttributes,
        })
        .from(emis)
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)))
        .limit(1);

      if (emiData.length === 0) {
        throw new Error(EMI_NOT_FOUND);
      }

      const attributes = emiData[0].additionalAttributes as Record<string, unknown>;
      const currentSplits =
        attributes.splits !== undefined
          ? (attributes.splits as Array<{ friendId: string; percentage: string }>)
          : [];

      const totalPercentage = currentSplits.reduce((sum, split) => {
        return sum + parseFloat(split.percentage);
      }, 0);

      const newPercentage = parseFloat(input.percentage);

      if (totalPercentage + newPercentage > 100) {
        throw new Error(
          `Cannot add split. Total percentage (${totalPercentage + newPercentage}%) would exceed 100%.`,
        );
      }

      const updatedSplits = [
        ...currentSplits,
        { friendId: input.friendId, percentage: input.percentage },
      ];

      await ctx.db
        .update(emis)
        .set({
          additionalAttributes: {
            ...attributes,
            splits: updatedSplits,
          },
        })
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)));

      return { success: true };
    }),
  updateEmiSplit: protectedProcedure
    .input(
      z.object({
        emiId: z.string(),
        splitIndex: z.number(),
        friendId: z.string(),
        percentage: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const emiData = await ctx.db
        .select({
          additionalAttributes: emis.additionalAttributes,
        })
        .from(emis)
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)))
        .limit(1);

      if (emiData.length === 0) {
        throw new Error(EMI_NOT_FOUND);
      }

      const attributes = emiData[0].additionalAttributes as Record<string, unknown>;
      const currentSplits =
        attributes.splits !== undefined
          ? (attributes.splits as Array<{ friendId: string; percentage: string }>)
          : [];

      if (input.splitIndex < 0 || input.splitIndex >= currentSplits.length) {
        throw new Error('Invalid split index');
      }

      const totalPercentage = currentSplits.reduce((sum, split, index) => {
        if (index === input.splitIndex) {
          return sum;
        }
        return sum + parseFloat(split.percentage);
      }, 0);

      const newPercentage = parseFloat(input.percentage);

      if (totalPercentage + newPercentage > 100) {
        throw new Error(
          `Cannot update split. Total percentage (${totalPercentage + newPercentage}%) would exceed 100%.`,
        );
      }

      const updatedSplits = [...currentSplits];
      updatedSplits[input.splitIndex] = { friendId: input.friendId, percentage: input.percentage };

      await ctx.db
        .update(emis)
        .set({
          additionalAttributes: {
            ...attributes,
            splits: updatedSplits,
          },
        })
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)));

      return { success: true };
    }),
  deleteEmiSplit: protectedProcedure
    .input(
      z.object({
        emiId: z.string(),
        splitIndex: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const emiData = await ctx.db
        .select({
          additionalAttributes: emis.additionalAttributes,
        })
        .from(emis)
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)))
        .limit(1);

      if (emiData.length === 0) {
        throw new Error(EMI_NOT_FOUND);
      }

      const attributes = emiData[0].additionalAttributes as Record<string, unknown>;
      const currentSplits =
        attributes.splits !== undefined
          ? (attributes.splits as Array<{ friendId: string; percentage: string }>)
          : [];

      if (input.splitIndex < 0 || input.splitIndex >= currentSplits.length) {
        throw new Error('Invalid split index');
      }

      const updatedSplits = currentSplits.filter((_, index) => index !== input.splitIndex);

      await ctx.db
        .update(emis)
        .set({
          additionalAttributes: {
            ...attributes,
            splits: updatedSplits,
          },
        })
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)));

      return { success: true };
    }),
});
