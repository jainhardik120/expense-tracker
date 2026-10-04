import { endOfMonth, parse } from 'date-fns';
import { and, desc, eq, gte, inArray, lt, or, sql, sum } from 'drizzle-orm';
import { z } from 'zod';

import { statementAttribute } from '@/db/attribute-sql';
import type { EmiSplit } from '@/db/attributes';
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
  getRecurringLinkedStatements,
  getEMIData,
  countEMIs,
  getEMIs,
  getMaxInstallmentNoSubquery,
  getStatementAttributes,
  lockEMIData,
  lockStatementAttributes,
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

const sumPercentages = (splits: EmiSplit[]) =>
  splits.reduce((sum, split) => sum + parseFloat(split.percentage), 0);

const assertSplitIndex = (splits: EmiSplit[], index: number) => {
  if (index < 0 || index >= splits.length) {
    throw new Error('Invalid split index');
  }
};

const changeEmiSplits = (
  db: Database,
  userId: string,
  emiId: string,
  change: (currentSplits: EmiSplit[]) => EmiSplit[],
) =>
  db.transaction(async (tx) => {
    const attributes = (await lockEMIData(tx, userId, emiId)).additionalAttributes;
    await tx
      .update(emis)
      .set({ additionalAttributes: { ...attributes, splits: change(attributes.splits ?? []) } })
      .where(and(eq(emis.id, emiId), eq(emis.userId, userId)));
    return { success: true };
  });

export const emisRouter = createTRPCRouter({
  getEmis: protectedProcedure.input(emiParserSchema).query(async ({ ctx, input }) => {
    const [count, emisList] = await Promise.all([
      countEMIs(ctx.db, ctx.user.id, input),
      getEMIs(ctx.db, ctx.user.id, input),
    ]);
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
      const peeked = (await getStatementAttributes(ctx.db, ctx.user.id, input.statementId))
        .attributes;
      if (typeof peeked.emiId !== 'string') {
        throw new Error(STATEMENT_NOT_LINKED);
      }
      const { emiId } = peeked;
      return ctx.db.transaction(async (tx) => {
        await lockEMIData(tx, ctx.user.id, emiId);
        const { attributes } = await lockStatementAttributes(tx, ctx.user.id, input.statementId);
        if (attributes.emiId !== emiId) {
          throw new Error(STATEMENT_NOT_LINKED);
        }
        const currentInstallmentNo =
          typeof attributes.installmentNo === 'number' ? attributes.installmentNo : null;
        if (currentInstallmentNo === null) {
          throw new Error('Statement does not have a valid installment number');
        }
        const maxInstallmentNo = await getMaxInstallment(tx, ctx.user.id, emiId);
        if (maxInstallmentNo === null) {
          throw new Error(STATEMENT_NOT_LINKED);
        }
        if (currentInstallmentNo !== parseFloatSafe(maxInstallmentNo)) {
          throw new Error(
            `Cannot unlink installment ${currentInstallmentNo}. Only the last payment (installment ${maxInstallmentNo}) can be unlinked.`,
          );
        }
        await tx
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
      });
    }),
  linkStatement: protectedProcedure
    .input(
      z.object({
        emiId: z.string(),
        statementId: z.string(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const emi = await lockEMIData(tx, ctx.user.id, input.emiId);
        const statement = await lockStatementAttributes(tx, ctx.user.id, input.statementId);
        const { attributes } = statement;
        if (attributes.emiId !== undefined) {
          throw new Error('Statement is already linked to an EMI');
        }
        const { schedule: payments } = calculateSchedule(emi);
        const firstPayment = payments[0].installment;
        let lastInstallmentNo = firstPayment - 1;
        const maxInstallmentNo = await getMaxInstallment(tx, ctx.user.id, input.emiId);
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
        await tx
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
    ),
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
          and(eq(statements.userId, ctx.user.id), eq(statementAttribute('emiId'), input.emiId)),
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
      const allEMIs = await getEMIs(ctx.db, ctx.user.id, { ...emiQuery, completed: undefined });
      const pendingEMIs = allEMIs.filter(
        (emi) =>
          emi.maxInstallmentNo === null ||
          parseFloatSafe(emi.maxInstallmentNo) < parseFloatSafe(emi.tenure),
      );
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
      const now = new Date();
      const periodStart = startOfMonthLocal(input?.rangeStart ?? now, timezone);
      const periodEnd = endOfMonthLocal(input?.rangeEnd ?? now, timezone);
      const cardAccountIds = cards.map((card) => card.accountId);
      const cutoff = periodStart < now ? periodStart : now;
      const openingByAccount = new Map<string, number>();
      if (cardAccountIds.length > 0) {
        const transfersBefore = (
          column:
            | typeof selfTransferStatements.toAccountId
            | typeof selfTransferStatements.fromAccountId,
        ) =>
          ctx.db
            .select({ accountId: column, total: sum(selfTransferStatements.amount) })
            .from(selfTransferStatements)
            .where(
              and(
                eq(selfTransferStatements.userId, ctx.user.id),
                inArray(column, cardAccountIds),
                lt(selfTransferStatements.createdAt, cutoff),
              ),
            )
            .groupBy(column);
        const [openingStatements, transfersIn, transfersOut] = await Promise.all([
          ctx.db
            .select({
              accountId: statements.accountId,
              delta: sql<string>`COALESCE(SUM(CASE WHEN ${statements.statementKind} = 'expense' THEN -${statements.amount} ELSE ${statements.amount} END), 0)`,
            })
            .from(statements)
            .where(
              and(
                eq(statements.userId, ctx.user.id),
                inArray(statements.accountId, cardAccountIds),
                lt(statements.createdAt, cutoff),
              ),
            )
            .groupBy(statements.accountId),
          transfersBefore(selfTransferStatements.toAccountId),
          transfersBefore(selfTransferStatements.fromAccountId),
        ]);
        for (const row of [
          ...openingStatements.map((o) => ({ accountId: o.accountId, delta: Number(o.delta) })),
          ...transfersIn.map((o) => ({ accountId: o.accountId, delta: Number(o.total) })),
          ...transfersOut.map((o) => ({ accountId: o.accountId, delta: -Number(o.total) })),
        ]) {
          if (row.accountId !== null) {
            openingByAccount.set(
              row.accountId,
              (openingByAccount.get(row.accountId) ?? 0) + row.delta,
            );
          }
        }
      }
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
                  gte(statements.createdAt, cutoff),
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
                  gte(selfTransferStatements.createdAt, cutoff),
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
      const linkedRecurringStatements = await getRecurringLinkedStatements(ctx.db, ctx.user.id);

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
      const emiKey = (payment: (typeof periodEmiPayments)[number]) =>
        `${payment.emiId}-${payment.installment}-${payment.date.toISOString()}`;
      const absorbedEmiKeys = new Set<string>();

      const periodCardBills = getCardBillsInRange(
        cards.map((card) => ({
          ...card,
          startingBalance:
            Number(card.startingBalance) + (openingByAccount.get(card.accountId) ?? 0),
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
    .query(
      async ({ ctx, input }) =>
        (await getEMIData(ctx.db, ctx.user.id, input.emiId)).additionalAttributes.splits ?? [],
    ),
  addEmiSplit: protectedProcedure
    .input(
      z.object({
        emiId: z.string(),
        friendId: z.string(),
        percentage: z.string(),
      }),
    )
    .mutation(({ ctx, input }) =>
      changeEmiSplits(ctx.db, ctx.user.id, input.emiId, (currentSplits) => {
        const totalPercentage = sumPercentages(currentSplits);
        const newPercentage = parseFloat(input.percentage);
        if (totalPercentage + newPercentage > PERCENTAGE_DIVISOR) {
          throw new Error(
            `Cannot add split. Total percentage (${totalPercentage + newPercentage}%) would exceed 100%.`,
          );
        }
        return [...currentSplits, { friendId: input.friendId, percentage: input.percentage }];
      }),
    ),
  updateEmiSplit: protectedProcedure
    .input(
      z.object({
        emiId: z.string(),
        splitIndex: z.number(),
        friendId: z.string(),
        percentage: z.string(),
      }),
    )
    .mutation(({ ctx, input }) =>
      changeEmiSplits(ctx.db, ctx.user.id, input.emiId, (currentSplits) => {
        assertSplitIndex(currentSplits, input.splitIndex);
        const totalPercentage = sumPercentages(
          currentSplits.filter((_, index) => index !== input.splitIndex),
        );
        const newPercentage = parseFloat(input.percentage);
        if (totalPercentage + newPercentage > PERCENTAGE_DIVISOR) {
          throw new Error(
            `Cannot update split. Total percentage (${totalPercentage + newPercentage}%) would exceed 100%.`,
          );
        }
        return currentSplits.map((split, index) =>
          index === input.splitIndex
            ? { friendId: input.friendId, percentage: input.percentage }
            : split,
        );
      }),
    ),
  deleteEmiSplit: protectedProcedure
    .input(
      z.object({
        emiId: z.string(),
        splitIndex: z.number(),
      }),
    )
    .mutation(({ ctx, input }) =>
      changeEmiSplits(ctx.db, ctx.user.id, input.emiId, (currentSplits) => {
        assertSplitIndex(currentSplits, input.splitIndex);
        return currentSplits.filter((_, index) => index !== input.splitIndex);
      }),
    ),
});
