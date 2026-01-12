import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { bankAccount, creditCardAccounts, emis, statements } from '@/db/schema';
import { getPendingEMIs } from '@/server/helpers/emi';
import {
  calculateEMIAndPrincipal,
  getOutstandingBalanceOnInstallment,
  parseFloatSafe,
} from '@/server/helpers/emi-calculations';
import { getCreditCards } from '@/server/helpers/summary';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createEmiSchema, emiParserSchema, MONTHS_PER_YEAR, PERCENTAGE_DIVISOR } from '@/types';

const EMI_NOT_FOUND = 'EMI not found or access denied';
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_DAY = MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY;

interface EMIPayment {
  installmentNo: number;
  date: Date | null;
  expectedAmount: number;
  description: string;
}

interface EMIDataForCalculation {
  principal: string;
  tenure: string;
  annualInterestRate: string;
  gst: string;
  processingFees: string;
  processingFeesGst: string;
  firstInstallmentDate: Date | null;
  processingFeesDate: Date | null;
  iafe: string;
}

// Helper to calculate individual EMI payment schedules
const buildProcessingFeesPayment = (
  processingFees: number,
  processingFeesGst: number,
  processingFeesDate: Date | null,
): EMIPayment | null => {
  if (processingFees <= 0) {
    return null;
  }
  const processingFeesGSTAmount = (processingFees * processingFeesGst) / PERCENTAGE_DIVISOR;
  return {
    installmentNo: 0,
    date: processingFeesDate,
    expectedAmount: processingFees + processingFeesGSTAmount,
    description: 'Processing Fees',
  };
};

const calculateInstallmentDate = (
  firstInstallmentDate: Date | null,
  monthOffset: number,
): Date | null => {
  if (firstInstallmentDate === null) {
    return null;
  }
  const installmentDate = new Date(firstInstallmentDate);
  installmentDate.setMonth(installmentDate.getMonth() + monthOffset);
  return installmentDate;
};

// Helper function to calculate EMI payment amounts including IAFE and GST
const calculateEMIPayments = (emiData: EMIDataForCalculation): EMIPayment[] => {
  const principal = parseFloatSafe(emiData.principal);
  const tenure = parseFloatSafe(emiData.tenure);
  const annualRate = parseFloatSafe(emiData.annualInterestRate);
  const gstRate = parseFloatSafe(emiData.gst);
  const iafe = parseFloatSafe(emiData.iafe);
  const processingFees = parseFloatSafe(emiData.processingFees);
  const processingFeesGst = parseFloatSafe(emiData.processingFeesGst);

  const monthlyRate = annualRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

  // Calculate base EMI
  let emi: number;
  if (monthlyRate === 0) {
    emi = principal / tenure;
  } else {
    emi =
      (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
      (Math.pow(1 + monthlyRate, tenure) - 1);
  }

  const payments: EMIPayment[] = [];

  // Add processing fees if present
  const processingFeesPayment = buildProcessingFeesPayment(
    processingFees,
    processingFeesGst,
    emiData.processingFeesDate,
  );
  if (processingFeesPayment !== null) {
    payments.push(processingFeesPayment);
  }

  // Calculate EMI payments with dates
  let balance = principal;
  for (let month = 1; month <= tenure; month++) {
    const interest = balance * monthlyRate;
    const principalComponent = emi - interest;
    balance = Math.max(balance - principalComponent, 0);

    const gst = (interest * gstRate) / PERCENTAGE_DIVISOR;
    let totalPayment = emi + gst;

    // Add IAFE to first EMI
    if (month === 1 && iafe > 0) {
      const iafeGST = (iafe * gstRate) / PERCENTAGE_DIVISOR;
      totalPayment += iafe + iafeGST;
    }

    const installmentDate = calculateInstallmentDate(emiData.firstInstallmentDate, month - 1);

    payments.push({
      installmentNo: month,
      date: installmentDate,
      expectedAmount: totalPayment,
      description: `EMI ${month}`,
    });
  }

  return payments;
};

// Helper to check if dates are within range (±3 days)
const isDateWithinRange = (date1: Date, date2: Date, daysTolerance = 3): boolean => {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  const diffDays = diffMs / MS_PER_DAY;
  return diffDays <= daysTolerance;
};

// Helper to check if amounts are within range (±10)
const isAmountWithinRange = (amount1: number, amount2: number, tolerance = 10): boolean => {
  return Math.abs(amount1 - amount2) <= tolerance;
};

// Helper to match statement with payment
const findMatchingPayment = (
  payments: EMIPayment[],
  statementAmount: number,
  statementDate: Date,
  existingInstallments: number[],
): number | null => {
  for (const payment of payments) {
    if (existingInstallments.includes(payment.installmentNo)) {
      continue;
    }

    const amountMatches = isAmountWithinRange(statementAmount, payment.expectedAmount);
    const hasDate = payment.date !== null;
    const dateMatches =
      hasDate && payment.date !== null ? isDateWithinRange(statementDate, payment.date) : false;

    if ((hasDate && dateMatches && amountMatches) || (!hasDate && amountMatches)) {
      return payment.installmentNo;
    }
  }
  return null;
};

// Helper to validate installment sequence
const validateInstallmentSequence = (
  existingInstallments: number[],
  newInstallmentNo: number,
  startInstallment: number,
): void => {
  const newInstallments = [...existingInstallments, newInstallmentNo].sort((a, b) => a - b);

  for (let i = 0; i < newInstallments.length; i++) {
    const expectedInstallmentNo = startInstallment + i;
    if (newInstallments[i] !== expectedInstallmentNo) {
      throw new Error(
        `Cannot link installment ${newInstallmentNo}. Missing previous installment ${expectedInstallmentNo}. Existing installments: [${existingInstallments.join(', ')}]`,
      );
    }
  }

  if (existingInstallments.includes(newInstallmentNo)) {
    throw new Error(`Installment ${newInstallmentNo} is already linked to another statement`);
  }
};

export const emisRouter = createTRPCRouter({
  getEmis: protectedProcedure.input(emiParserSchema).query(async ({ ctx, input }) => {
    const conditions = [eq(emis.userId, ctx.session.user.id)];

    if (input.creditId.length > 0) {
      conditions.push(inArray(emis.creditId, input.creditId));
    }
    if (input.accountId.length > 0) {
      conditions.push(inArray(creditCardAccounts.accountId, input.accountId));
    }
    const emisList = await ctx.db
      .select({
        id: emis.id,
        userId: emis.userId,
        name: emis.name,
        creditId: emis.creditId,
        principal: emis.principal,
        tenure: emis.tenure,
        annualInterestRate: emis.annualInterestRate,
        processingFees: emis.processingFees,
        processingFeesGst: emis.processingFeesGst,
        gst: emis.gst,
        createdAt: emis.createdAt,
        creditCardName: bankAccount.accountName,
        firstInstallmentDate: emis.firstInstallmentDate,
        processingFeesDate: emis.processingFeesDate,
        iafe: emis.iafe,
      })
      .from(emis)
      .innerJoin(creditCardAccounts, eq(emis.creditId, creditCardAccounts.id))
      .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
      .where(and(...conditions))
      .orderBy(desc(emis.createdAt))
      .limit(input.perPage)
      .offset((input.page - 1) * input.perPage);

    const [{ count }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(emis)
      .where(and(...conditions));

    const pageCount = Math.ceil(count / input.perPage);

    return {
      emis: emisList,
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
        name: input.name,
        creditId: input.creditId,
        principal: principal.toFixed(2).toString(),
        tenure: input.tenure,
        annualInterestRate: input.annualInterestRate,
        processingFees: input.processingFees,
        processingFeesGst: input.processingFeesGst,
        gst: input.gst,
        firstInstallmentDate: input.firstInstallmentDate,
        processingFeesDate: input.processingFeesDate,
        iafe: input.iafe,
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
      // Verify credit card belongs to user before allowing update
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

      // Calculate principal based on calculation mode
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
        throw new Error('Statement is not linked to an EMI');
      }

      const currentInstallmentNo =
        typeof attributes.installmentNo === 'number' ? attributes.installmentNo : null;

      if (currentInstallmentNo === null) {
        throw new Error('Statement does not have a valid installment number');
      }

      const emiId = attributes.emiId as string;

      // Get all linked statements for this EMI
      const allLinkedStatements = await ctx.db
        .select({
          id: statements.id,
          attributes: statements.additionalAttributes,
        })
        .from(statements)
        .where(
          and(
            eq(statements.userId, ctx.session.user.id),
            eq(sql`${statements.additionalAttributes}->>'emiId'`, emiId),
          ),
        );

      // Extract all installment numbers
      const allInstallmentNos = allLinkedStatements
        .map((s) => {
          const attrs = s.attributes as Partial<Record<string, unknown>>;
          return typeof attrs.installmentNo === 'number' ? attrs.installmentNo : null;
        })
        .filter((no): no is number => no !== null)
        .sort((a, b) => b - a); // Sort descending to get max first

      const maxInstallmentNo = allInstallmentNos[0];

      // Only allow unlinking if it's the last payment
      if (currentInstallmentNo !== maxInstallmentNo) {
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
          id: emis.id,
          accountId: creditCardAccounts.accountId,
          principal: emis.principal,
          tenure: emis.tenure,
          annualInterestRate: emis.annualInterestRate,
          gst: emis.gst,
          processingFees: emis.processingFees,
          processingFeesGst: emis.processingFeesGst,
          firstInstallmentDate: emis.firstInstallmentDate,
          processingFeesDate: emis.processingFeesDate,
          iafe: emis.iafe,
        })
        .from(emis)
        .leftJoin(creditCardAccounts, eq(emis.creditId, creditCardAccounts.id))
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)))
        .limit(1);

      if (emiData.length === 0) {
        throw new Error(EMI_NOT_FOUND);
      }

      const emi = emiData[0];

      // Fetch statement details
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

      // Calculate EMI payment schedule
      const payments = calculateEMIPayments(emi);

      // Get existing linked statements
      const existingStatements = await ctx.db
        .select({
          id: statements.id,
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
        );

      const existingInstallments = existingStatements
        .map((s) => {
          const attrs = s.attributes as Partial<Record<string, unknown>>;
          return typeof attrs.installmentNo === 'number' ? attrs.installmentNo : null;
        })
        .filter((no): no is number => no !== null)
        .sort((a, b) => a - b);

      let statementAmount = parseFloatSafe(statement.amount);
      const statementDate = new Date(statement.createdAt);
      if (
        statementAmount < 0 &&
        (statement.statementKind === 'friend_transaction' ||
          statement.statementKind === 'outside_transaction')
      ) {
        statementAmount = statementAmount * -1;
      }
      const matchedInstallmentNo = findMatchingPayment(
        payments,
        statementAmount,
        statementDate,
        existingInstallments,
      );

      if (matchedInstallmentNo === null) {
        const paymentInfo = payments
          .map((p) => {
            const dateStr = p.date === null ? 'N/A' : p.date.toISOString();
            return `[${p.installmentNo}] ${p.expectedAmount} on ${dateStr}`;
          })
          .join(', ');
        throw new Error(
          `Could not match statement to any EMI installment. Statement amount: ${statementAmount}, date: ${statementDate.toISOString()}. Expected amounts: ${paymentInfo}`,
        );
      }

      // Validate installment order
      const startInstallment = payments[0]?.installmentNo ?? 0;
      validateInstallmentSequence(existingInstallments, matchedInstallmentNo, startInstallment);

      // Update statement with EMI ID and installment number
      await ctx.db
        .update(statements)
        .set({
          additionalAttributes: {
            ...attributes,
            emiId: input.emiId,
            installmentNo: matchedInstallmentNo,
          },
        })
        .where(eq(statements.id, input.statementId));

      return {
        success: true,
        installmentNo: matchedInstallmentNo,
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
  getPendingEMIs: protectedProcedure.query(async ({ ctx }) => {
    return getPendingEMIs(ctx.db, ctx.session.user.id);
  }),
  getCreditCardsWithOutstandingBalance: protectedProcedure.query(async ({ ctx }) => {
    const cards = await getCreditCards(ctx.db, ctx.session.user.id);
    const pendingEMIs = await getPendingEMIs(ctx.db, ctx.session.user.id);
    const usedLimits: Record<string, number> = cards.reduce<Record<string, number>>((acc, card) => {
      const cardId = card.id;
      const pendingEMI = pendingEMIs.filter((emi) => emi.emi.creditId === cardId);
      if (pendingEMI.length === 0) {
        return acc;
      }
      const outstandingBalance = pendingEMI.reduce((acc, emi) => {
        const oB = getOutstandingBalanceOnInstallment(
          emi.emi,
          emi.maxInstallmentNo === null ? null : parseInt(emi.maxInstallmentNo),
        );
        return acc + oB;
      }, 0);
      return {
        ...acc,
        [cardId]: outstandingBalance,
      };
    }, {});
    return {
      cards,
      pendingEMIs,
      usedLimits,
    };
  }),
});
