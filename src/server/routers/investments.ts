import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { investments } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createInvestmentSchema, investmentParserSchema } from '@/types';

export const investmentsRouter = createTRPCRouter({
  getInvestmentKinds: protectedProcedure.query(async ({ ctx }) => {
    return (
      await ctx.db
        .selectDistinct({ investmentKind: investments.investmentKind })
        .from(investments)
        .where(eq(investments.userId, ctx.session.user.id))
    ).map((c) => c.investmentKind);
  }),

  getInvestments: protectedProcedure.input(investmentParserSchema).query(async ({ ctx, input }) => {
    const conditions = [eq(investments.userId, ctx.session.user.id)];

    if (input.start !== undefined) {
      conditions.push(gte(investments.investmentDate, input.start));
    }
    if (input.end !== undefined) {
      conditions.push(lte(investments.investmentDate, input.end));
    }
    if (input.investmentKind.length > 0) {
      conditions.push(inArray(investments.investmentKind, input.investmentKind));
    }

    const investmentsList = await ctx.db
      .select()
      .from(investments)
      .where(and(...conditions))
      .orderBy(desc(investments.investmentDate))
      .limit(input.perPage)
      .offset((input.page - 1) * input.perPage);

    const [{ count }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(investments)
      .where(and(...conditions));

    const pageCount = Math.ceil(count / input.perPage);

    return {
      investments: investmentsList,
      pageCount,
      rowsCount: count,
    };
  }),

  addInvestment: protectedProcedure
    .input(createInvestmentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .insert(investments)
        .values({
          userId: ctx.session.user.id,
          ...input,
          maturityDate: input.maturityDate ?? null,
          maturityAmount: input.maturityAmount ?? null,
          amount: input.amount ?? null,
          units: input.units ?? null,
          purchaseRate: input.purchaseRate ?? null,
        })
        .returning({ id: investments.id });
    }),

  updateInvestment: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        createInvestmentSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(investments)
        .set({
          ...input.createInvestmentSchema,
          maturityDate: input.createInvestmentSchema.maturityDate ?? null,
          maturityAmount: input.createInvestmentSchema.maturityAmount ?? null,
          amount: input.createInvestmentSchema.amount ?? null,
          units: input.createInvestmentSchema.units ?? null,
          purchaseRate: input.createInvestmentSchema.purchaseRate ?? null,
        })
        .where(and(eq(investments.id, input.id), eq(investments.userId, ctx.session.user.id)))
        .returning({ id: investments.id });
    }),

  deleteInvestment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .delete(investments)
        .where(and(eq(investments.id, input.id), eq(investments.userId, ctx.session.user.id)))
        .returning({ id: investments.id });
    }),
});
