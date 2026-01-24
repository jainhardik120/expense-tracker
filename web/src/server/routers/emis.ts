import { endOfMonth } from 'date-fns';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { emis, statements, recurringPayments } from '@/db/schema';
import { getTimezone, startOfDayLocal } from '@/lib/date';
import { type Database } from '@/lib/db';
import {
  getEMIData,
  getEMIs,
  getMaxInstallmentNoSubquery,
  getStatementAttributes,
  verifyCreditCardAccount,
} from '@/server/helpers/emi';
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
import { createEmiSchema, emiParserSchema, MONTHS_PER_YEAR, PERCENTAGE_DIVISOR } from '@/types';

const EMI_NOT_FOUND = 'EMI not found or access denied';
const STATEMENT_NOT_LINKED = 'Statement is not linked to an EMI';

const getEMIUpsertData = async (input: z.infer<typeof createEmiSchema>) => {
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
  const timezone = await getTimezone();
  const firstInstallmentDate = startOfDayLocal(input.firstInstallmentDate, timezone);
  const processingFeesDate = startOfDayLocal(input.processingFeesDate, timezone);
  return {
    ...{
      ...input,
      calculationMode: undefined,
      emiAmount: undefined,
      totalEmiAmount: undefined,
    },
    principal: principal.toFixed(2).toString(),
    firstInstallmentDate,
    processingFeesDate,
  };
};

const getMaxInstallment = async (
  db: Database,
  userId: string,
  emiId: string,
): Promise<string | null> => {
  const maxInstallmentQuery = getMaxInstallmentNoSubquery(db, userId);
  const maxInstallment = await db
    .select({
      maxInstallmentNo: maxInstallmentQuery.maxInstallmentNo,
    })
    .from(maxInstallmentQuery)
    .where(eq(maxInstallmentQuery.emiId, emiId));
  return maxInstallment.length === 0 ? null : maxInstallment[0].maxInstallmentNo;
};

export const emisRouter = createTRPCRouter({
  getEmis: protectedProcedure.input(emiParserSchema).query(async ({ ctx, input }) => {
    const conditions = [eq(emis.userId, ctx.user.id)];
    const [{ count }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(emis)
      .where(and(...conditions));
    const emisList = await getEMIs(ctx.db, ctx.user.id, input);
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
    await verifyCreditCardAccount(ctx.db, ctx.user.id, input.creditId);
    const data = await getEMIUpsertData(input);
    return ctx.db
      .insert(emis)
      .values({
        userId: ctx.user.id,
        ...data,
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
      await verifyCreditCardAccount(ctx.db, ctx.user.id, input.creditId);
      const { id, ...inputData } = input;
      const data = await getEMIUpsertData(inputData);
      const result = await ctx.db
        .update(emis)
        .set(data)
        .where(and(eq(emis.id, id), eq(emis.userId, ctx.user.id)))
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
        .where(and(eq(emis.id, input.id), eq(emis.userId, ctx.user.id)))
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
      const attributes = (await getStatementAttributes(ctx.db, ctx.user.id, input.statementId))
        .attributes as Partial<Record<string, unknown>>;
      if (attributes.emiId === undefined) {
        throw new Error(STATEMENT_NOT_LINKED);
      }
      const currentInstallmentNo =
        typeof attributes.installmentNo === 'number' ? attributes.installmentNo : null;
      if (currentInstallmentNo === null) {
        throw new Error('Statement does not have a valid installment number');
      }
      const emiId = attributes.emiId as string;
      const maxInstallmentNo = await getMaxInstallment(ctx.db, ctx.user.id, emiId);
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
      const emi = await getEMIData(ctx.db, ctx.user.id, input.emiId);
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
        .where(and(eq(statements.id, input.statementId), eq(statements.userId, ctx.user.id)))
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
      const maxInstallmentNo = await getMaxInstallment(ctx.db, ctx.user.id, input.emiId);
      if (maxInstallmentNo !== null) {
        lastInstallmentNo = parseFloatSafe(maxInstallmentNo);
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
            eq(statements.userId, ctx.user.id),
            eq(sql`${statements.additionalAttributes}->>'emiId'`, input.emiId),
          ),
        )
        .orderBy(desc(statements.createdAt));
    }),
  getCreditCardsWithOutstandingBalance: protectedProcedure
    .input(
      z
        .object({
          uptoDate: z.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const cards = await getCreditCards(ctx.db, ctx.user.id);
      const pendingEMIs = await getEMIs(ctx.db, ctx.user.id, {
        completed: false,
        perPage: 100,
        page: 1,
        accountId: [],
        creditId: [],
      });
      const timezone = await getTimezone();
      const currentMonthPayments: {
        emiId: string;
        emiName: string;
        cardName: string;
        amount: number;
        date: Date;
        myShare: number;
        splitPercentage: number;
      }[] = [];
      const futurePayments: {
        emiId: string;
        emiName: string;
        cardName: string;
        amount: number;
        date: Date;
        month: string;
        myShare: number;
        splitPercentage: number;
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
      const activeRecurringPayments = await ctx.db
        .select()
        .from(recurringPayments)
        .where(eq(recurringPayments.userId, ctx.user.id))
        .orderBy(desc(recurringPayments.startDate));
      return {
        cards,
        cardDetails,
        currentMonthPayments,
        paymentsByMonth,
        recurringPayments: activeRecurringPayments,
        uptoDate: input?.uptoDate,
      };
    }),
  getEmiSplits: protectedProcedure
    .input(z.object({ emiId: z.string() }))
    .query(async ({ ctx, input }) => {
      const attributes = (await getEMIData(ctx.db, ctx.user.id, input.emiId))
        .additionalAttributes as Record<string, unknown>;
      return attributes.splits === undefined
        ? []
        : (attributes.splits as Array<{ friendId: string; percentage: string }>);
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
      const attributes = (await getEMIData(ctx.db, ctx.user.id, input.emiId))
        .additionalAttributes as Record<string, unknown>;
      const currentSplits =
        attributes.splits === undefined
          ? []
          : (attributes.splits as Array<{ friendId: string; percentage: string }>);

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
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.user.id)));

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
      const attributes = (await getEMIData(ctx.db, ctx.user.id, input.emiId))
        .additionalAttributes as Record<string, unknown>;
      const currentSplits =
        attributes.splits === undefined
          ? []
          : (attributes.splits as Array<{ friendId: string; percentage: string }>);

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
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.user.id)));

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
      const attributes = (await getEMIData(ctx.db, ctx.user.id, input.emiId))
        .additionalAttributes as Record<string, unknown>;
      const currentSplits =
        attributes.splits === undefined
          ? []
          : (attributes.splits as Array<{ friendId: string; percentage: string }>);

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
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.user.id)));

      return { success: true };
    }),
});
