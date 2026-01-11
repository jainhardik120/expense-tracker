import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { bankAccount, creditCardAccounts, emis, statements } from '@/db/schema';
import { calculateEMIAndPrincipal, parseFloatSafe } from '@/server/helpers/emi-calculations';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createEmiSchema, emiParserSchema, MONTHS_PER_YEAR, PERCENTAGE_DIVISOR } from '@/types';

const EMI_NOT_FOUND = 'EMI not found or access denied';

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
      tenureMonths: tenure,
      principalAmount: parseFloatSafe(input.principalAmount),
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
        tenureMonths: tenure,
        principalAmount: parseFloatSafe(input.principalAmount),
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
      await ctx.db
        .update(statements)
        .set({
          additionalAttributes: {
            ...attributes,
            emiId: undefined,
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
      const emiDetails = await ctx.db
        .select({
          id: emis.id,
          accountId: creditCardAccounts.accountId,
        })
        .from(emis)
        .leftJoin(creditCardAccounts, eq(emis.creditId, creditCardAccounts.id))
        .where(and(eq(emis.id, input.emiId), eq(emis.userId, ctx.session.user.id)))
        .limit(1);
      if (emiDetails.length === 0) {
        throw new Error(EMI_NOT_FOUND);
      }
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
      if (attributes.emiId !== undefined) {
        throw new Error('Statement is already linked to an EMI');
      }
      await ctx.db
        .update(statements)
        .set({
          additionalAttributes: {
            ...attributes,
            emiId: input.emiId,
          },
        })
        .where(eq(statements.id, input.statementId));
      return { success: true };
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
        })
        .from(statements)
        .where(
          and(
            eq(statements.userId, ctx.session.user.id),
            eq(sql`${statements.additionalAttributes}->>'emiId'`, input.emiId),
          ),
        );
    }),
});
