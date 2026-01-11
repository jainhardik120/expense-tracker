import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { bankAccount, creditCardAccounts, emis } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createEmiSchema, emiParserSchema, MONTHS_PER_YEAR, PERCENTAGE_DIVISOR } from '@/types';

const EMI_NOT_FOUND = 'EMI not found or access denied';

// Helper function to calculate principal from EMI
const calculatePrincipalFromEMI = (
  emi: number,
  monthlyRate: number,
  tenure: number,
): number => {
  if (monthlyRate === 0) {
    return emi * tenure;
  }
  return (
    (emi * (Math.pow(1 + monthlyRate, tenure) - 1)) /
    (monthlyRate * Math.pow(1 + monthlyRate, tenure))
  );
};

const parseFloatSafe = (value: string | undefined): number => {
  if (value === '' || value === undefined || isNaN(Number.parseFloat(value))) {
    return 0;
  }
  return Number.parseFloat(value);
};

export const emisRouter = createTRPCRouter({
  getEmis: protectedProcedure.input(emiParserSchema).query(async ({ ctx, input }) => {
    const conditions = [eq(emis.userId, ctx.session.user.id)];

    if (input.creditId.length > 0) {
      conditions.push(inArray(emis.creditId, input.creditId));
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
    // Verify credit card belongs to user
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

    // Calculate principal based on calculation mode
    const tenure = parseFloatSafe(input.tenure);
    const annualRate = parseFloatSafe(input.annualInterestRate);
    const monthlyRate = annualRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

    let principal: number = 0;

    if (input.calculationMode === 'principal') {
      principal = parseFloatSafe(input.principalAmount);
    } else if (input.calculationMode === 'emi') {
      const emi = parseFloatSafe(input.emiAmount);
      principal = calculatePrincipalFromEMI(emi, monthlyRate, tenure);
    } else {
      // calculationMode === 'totalEmi'
      const totalEmi = parseFloatSafe(input.totalEmiAmount);
      const emi = totalEmi / tenure;
      principal = calculatePrincipalFromEMI(emi, monthlyRate, tenure);
    }

    return ctx.db
      .insert(emis)
      .values({
        userId: ctx.session.user.id,
        name: input.name,
        creditId: input.creditId,
        principal: principal.toString(),
        tenure: input.tenure,
        annualInterestRate: input.annualInterestRate,
        processingFees: input.processingFees,
        processingFeesGst: input.processingFeesGst,
        gst: input.gst,
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
          and(eq(creditCardAccounts.id, input.creditId), eq(bankAccount.userId, ctx.session.user.id)),
        )
        .limit(1);

      if (creditCard.length === 0) {
        throw new Error('Credit card not found or access denied');
      }

      // Calculate principal based on calculation mode
      const tenure = parseFloatSafe(input.tenure);
      const annualRate = parseFloatSafe(input.annualInterestRate);
      const monthlyRate = annualRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

      let principal: number = 0;

      if (input.calculationMode === 'principal') {
        principal = parseFloatSafe(input.principalAmount);
      } else if (input.calculationMode === 'emi') {
        const emi = parseFloatSafe(input.emiAmount);
        principal = calculatePrincipalFromEMI(emi, monthlyRate, tenure);
      } else {
        // calculationMode === 'totalEmi'
        const totalEmi = parseFloatSafe(input.totalEmiAmount);
        const emi = totalEmi / tenure;
        principal = calculatePrincipalFromEMI(emi, monthlyRate, tenure);
      }

      const { id, ...restInput } = input;
      const result = await ctx.db
        .update(emis)
        .set({
          name: restInput.name,
          creditId: restInput.creditId,
          principal: principal.toString(),
          tenure: restInput.tenure,
          annualInterestRate: restInput.annualInterestRate,
          processingFees: restInput.processingFees,
          processingFeesGst: restInput.processingFeesGst,
          gst: restInput.gst,
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
});
