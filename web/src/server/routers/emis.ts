import { endOfMonth, parse } from 'date-fns';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { emis, selfTransferStatements, statements, recurringPayments } from '@/db/schema';
import {
  getCardBillsInRange,
  getStatementBalanceDelta,
  type CreditCardActivity,
} from '@/lib/credit-card-bills';
import { endOfMonthLocal, getTimezone, startOfDayLocal, startOfMonthLocal } from '@/lib/date';
import { type Database } from '@/lib/db';
import { getCreditCards } from '@/server/helpers/account';
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
  getEmiPaymentsInRange,
} from '@/server/helpers/emi-calculations';
import { getRecurringPaymentsInRange } from '@/server/helpers/recurring-calculations';
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
      const firstPayment = payments[0].installment;
      let lastInstallmentNo = firstPayment - 1;
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
  getLinkCandidates: protectedProcedure
    .input(z.object({ statementId: z.string() }))
    .query(async ({ ctx, input }) => {
      const statementData = await ctx.db
        .select({
          accountId: statements.accountId,
          amount: statements.amount,
          createdAt: statements.createdAt,
        })
        .from(statements)
        .where(and(eq(statements.id, input.statementId), eq(statements.userId, ctx.user.id)))
        .limit(1);
      if (statementData.length === 0) {
        throw new Error('Statement not found or access denied');
      }
      const statement = statementData[0];
      if (statement.accountId === null) {
        return [];
      }
      // Only EMIs with installments still due can accept another payment.
      const pendingEMIs = await getEMIs(ctx.db, ctx.user.id, {
        page: 1,
        perPage: 100,
        creditId: [],
        accountId: [statement.accountId],
        completed: false,
      });
      const statementAmount = Math.abs(parseFloatSafe(statement.amount));
      return pendingEMIs
        .map((emi) => {
          const { schedule } = calculateSchedule(emi);
          const lastInstallmentNo =
            emi.maxInstallmentNo === null
              ? schedule[0].installment - 1
              : parseFloatSafe(emi.maxInstallmentNo);
          const nextInstallmentNo = lastInstallmentNo + 1;
          if (!confirmMatch(schedule, statementAmount, statement.createdAt, nextInstallmentNo)) {
            return null;
          }
          const nextInstallment = schedule.find((row) => row.installment === nextInstallmentNo);
          return {
            id: emi.id,
            name: emi.name,
            creditCardName: emi.creditCardName,
            installmentNo: nextInstallmentNo,
            tenure: parseFloatSafe(emi.tenure),
            amount: nextInstallment?.totalPayment ?? null,
            scheduledDate: nextInstallment?.date ?? null,
          };
        })
        .filter((candidate) => candidate !== null);
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
          rangeStart: z.date().optional(),
          rangeEnd: z.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const cards = await getCreditCards(ctx.db, ctx.user.id);
      const emiQuery = {
        perPage: 100,
        page: 1,
        accountId: [],
        creditId: [],
      };
      const pendingEMIs = await getEMIs(ctx.db, ctx.user.id, { ...emiQuery, completed: false });
      // A period in the past can contain installments of an EMI that has since
      // finished, so the period view needs the completed ones too.
      const allEMIs = await getEMIs(ctx.db, ctx.user.id, { ...emiQuery, completed: undefined });
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
      // EMIs project until they finish, so recurring payments have to project at least
      // that far too, otherwise the future-months table shows a bare EMI column with
      // zero recurring for every month past the requested horizon.
      const requestedHorizon = input?.uptoDate ?? monthEnd;
      const lastEmiMonth = Object.keys(paymentsByMonth)
        .sort((a, b) => a.localeCompare(b))
        .at(-1);
      const recurringHorizon =
        lastEmiMonth === undefined
          ? requestedHorizon
          : new Date(
              Math.max(
                requestedHorizon.getTime(),
                endOfMonth(parse(lastEmiMonth, 'yyyy-MM', new Date())).getTime(),
              ),
            );
      const cardAccountIds = cards.map((card) => card.accountId);
      const cardStatements =
        cardAccountIds.length === 0
          ? []
          : await ctx.db
              .select({
                accountId: statements.accountId,
                amount: statements.amount,
                statementKind: statements.statementKind,
                createdAt: statements.createdAt,
              })
              .from(statements)
              .where(
                and(
                  eq(statements.userId, ctx.user.id),
                  inArray(statements.accountId, cardAccountIds),
                ),
              );
      const cardTransfers =
        cardAccountIds.length === 0
          ? []
          : await ctx.db
              .select({
                fromAccountId: selfTransferStatements.fromAccountId,
                toAccountId: selfTransferStatements.toAccountId,
                amount: selfTransferStatements.amount,
                createdAt: selfTransferStatements.createdAt,
              })
              .from(selfTransferStatements)
              .where(
                and(
                  eq(selfTransferStatements.userId, ctx.user.id),
                  or(
                    inArray(selfTransferStatements.fromAccountId, cardAccountIds),
                    inArray(selfTransferStatements.toAccountId, cardAccountIds),
                  ),
                ),
              );
      const cardActivities: CreditCardActivity[] = [
        ...cardStatements.flatMap((statement) =>
          statement.accountId === null
            ? []
            : [
                {
                  accountId: statement.accountId,
                  createdAt: statement.createdAt,
                  balanceDelta: getStatementBalanceDelta(
                    statement.statementKind,
                    Number(statement.amount),
                  ),
                },
              ],
        ),
        ...cardTransfers.flatMap((transfer) => {
          const activity: CreditCardActivity[] = [];
          if (cardAccountIds.includes(transfer.toAccountId)) {
            activity.push({
              accountId: transfer.toAccountId,
              createdAt: transfer.createdAt,
              balanceDelta: Number(transfer.amount),
            });
          }
          if (cardAccountIds.includes(transfer.fromAccountId)) {
            activity.push({
              accountId: transfer.fromAccountId,
              createdAt: transfer.createdAt,
              balanceDelta: -Number(transfer.amount),
            });
          }
          return activity;
        }),
      ];
      const activeRecurringPayments = await ctx.db
        .select()
        .from(recurringPayments)
        .where(eq(recurringPayments.userId, ctx.user.id))
        .orderBy(desc(recurringPayments.startDate));
      const linkedRecurringStatements = await ctx.db
        .select({
          id: statements.id,
          amount: statements.amount,
          createdAt: statements.createdAt,
          recurringPaymentId: sql<string>`${statements.additionalAttributes}->>'recurringPaymentId'`,
        })
        .from(statements)
        .where(
          and(
            eq(statements.userId, ctx.user.id),
            sql`${statements.additionalAttributes}->>'recurringPaymentId' IS NOT NULL`,
          ),
        );
      // Everything falling due inside the period selected at the top of the dashboard.
      // Defaults to the current month when the caller does not narrow it down.
      // Snapped to whole months: the dashboard's range ends "today" by default, which
      // is right for expenses but would hide the rest of this month's payments, and
      // the period is picked a month at a time anyway.
      const now = new Date();
      const periodStart = startOfMonthLocal(input?.rangeStart ?? now, timezone);
      const periodEnd = endOfMonthLocal(input?.rangeEnd ?? now, timezone);

      const periodEmiPayments = allEMIs.flatMap((emi) =>
        getEmiPaymentsInRange(emi, emi.creditCardName, periodStart, periodEnd, now),
      );
      const periodRecurringPayments = activeRecurringPayments.flatMap((recurringPayment) =>
        getRecurringPaymentsInRange(
          recurringPayment,
          linkedRecurringStatements.filter(
            (statement) => statement.recurringPaymentId === recurringPayment.id,
          ),
          timezone,
          periodStart,
          periodEnd,
        ),
      );
      // EMI installments are billed to the card, so a bill that will include one
      // stands in for it. Beyond next month there are no bills, and then the
      // installment is the only concrete figure we have.
      const emiKey = (payment: (typeof periodEmiPayments)[number]) =>
        `${payment.emiId}-${payment.date.toISOString()}`;
      const absorbedEmiKeys = new Set<string>();

      const periodCardBills = getCardBillsInRange(
        cards.map((card) => ({
          ...card,
          startingBalance: Number(card.startingBalance),
          cardName: card.accountName,
        })),
        cardActivities,
        periodStart,
        periodEnd,
        now,
        timezone,
      )
        .map((bill) => {
          if (bill.status !== 'upcoming') {
            return bill;
          }
          // A bill still ahead of us has not absorbed this period's EMI installments
          // yet, so fold them in -- they will land on the same card before it is due.
          const yetToBill = periodEmiPayments.filter(
            (payment) =>
              payment.creditId === bill.cardId &&
              payment.status !== 'paid' &&
              payment.date <= bill.dueDate,
          );
          for (const payment of yetToBill) {
            absorbedEmiKeys.add(emiKey(payment));
          }
          const emiYetToBill = yetToBill.reduce((sum, payment) => sum + payment.amount, 0);
          return {
            ...bill,
            billedAmount: bill.billedAmount + emiYetToBill,
            remainingAmount: bill.remainingAmount + emiYetToBill,
          };
        })
        .filter((bill) => bill.billedAmount > 0);

      return {
        cards,
        cardDetails,
        currentMonthPayments,
        paymentsByMonth,
        recurringPayments: activeRecurringPayments,
        recurringHorizon,
        periodEmiPayments: periodEmiPayments.map((payment) => ({
          ...payment,
          absorbedByBill: absorbedEmiKeys.has(emiKey(payment)),
        })),
        periodRecurringPayments,
        periodCardBills,
        periodStart,
        periodEnd,
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
