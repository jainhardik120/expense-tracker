import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { investments } from '@/db/schema';
import { investmentKindValues, normalizeInvestmentKind } from '@/lib/investments';
import {
  enrichInvestments,
  getInstrumentHoldingTimeline,
  getInvestmentsDashboard,
  searchInvestmentInstruments,
} from '@/server/helpers/investments';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { amount, createInvestmentSchema, investmentParserSchema } from '@/types';

const optionalToNull = (value: string | undefined): string | null => {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  return value;
};

const optionalDateToNull = (value: Date | undefined): Date | null => {
  return value ?? null;
};

const normalizeInvestmentInput = (input: z.infer<typeof createInvestmentSchema>) => ({
  investmentKind: normalizeInvestmentKind(input.investmentKind),
  instrumentCode: optionalToNull(input.instrumentCode),
  investmentDate: input.investmentDate,
  investmentAmount: input.investmentAmount,
  maturityDate: optionalDateToNull(input.maturityDate),
  maturityAmount: optionalToNull(input.maturityAmount),
  amount: optionalToNull(input.amount),
  units: optionalToNull(input.units),
  purchaseRate: optionalToNull(input.purchaseRate),
  annualRate: optionalToNull(input.annualRate),
});

export const investmentsRouter = createTRPCRouter({
  getInvestmentKinds: protectedProcedure.query(async ({ ctx }) => {
    const kinds = await ctx.db
      .selectDistinct({ investmentKind: investments.investmentKind })
      .from(investments)
      .where(eq(investments.userId, ctx.user.id));
    return [...new Set(kinds.map((c) => normalizeInvestmentKind(c.investmentKind)))];
  }),

  getInvestments: protectedProcedure.input(investmentParserSchema).query(async ({ ctx, input }) => {
    const conditions = [eq(investments.userId, ctx.user.id)];

    if (input.start !== undefined) {
      conditions.push(gte(investments.investmentDate, input.start));
    }
    if (input.end !== undefined) {
      conditions.push(lte(investments.investmentDate, input.end));
    }
    if (input.investmentKind.length > 0) {
      conditions.push(inArray(investments.investmentKind, input.investmentKind));
    }

    const investmentsListRaw = await ctx.db
      .select()
      .from(investments)
      .where(and(...conditions))
      .orderBy(desc(investments.investmentDate))
      .limit(input.perPage)
      .offset((input.page - 1) * input.perPage);
    const investmentsList = await enrichInvestments(investmentsListRaw);

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

  getInvestmentsDashboard: protectedProcedure
    .input(
      z.object({
        start: z.date().optional(),
        end: z.date().optional(),
        investmentKind: z.string().array().optional().default([]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(investments.userId, ctx.user.id)];
      if (input.start !== undefined) {
        conditions.push(gte(investments.investmentDate, input.start));
      }
      if (input.end !== undefined) {
        conditions.push(lte(investments.investmentDate, input.end));
      }
      if (input.investmentKind.length > 0) {
        conditions.push(inArray(investments.investmentKind, input.investmentKind));
      }

      const investmentsListRaw = await ctx.db
        .select()
        .from(investments)
        .where(and(...conditions))
        .orderBy(desc(investments.investmentDate));
      const investmentsList = await enrichInvestments(investmentsListRaw);
      return getInvestmentsDashboard({
        investmentsList,
        start: input.start,
        end: input.end,
      });
    }),

  searchInstruments: protectedProcedure
    .input(
      z.object({
        kind: z.enum(investmentKindValues),
        query: z.string().trim().max(120),
      }),
    )
    .query(async ({ input }) => {
      return searchInvestmentInstruments(input.kind, input.query);
    }),

  getInstrumentTimeline: protectedProcedure
    .input(
      z.object({
        kind: z.enum(investmentKindValues),
        code: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(investments)
        .where(
          and(
            eq(investments.userId, ctx.user.id),
            eq(investments.investmentKind, input.kind),
            eq(investments.instrumentCode, input.code),
          ),
        )
        .orderBy(desc(investments.investmentDate));
      const enriched = await enrichInvestments(rows);
      return getInstrumentHoldingTimeline({
        kind: input.kind,
        code: input.code,
        investmentsList: enriched,
      });
    }),

  addInvestment: protectedProcedure
    .input(createInvestmentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .insert(investments)
        .values({
          userId: ctx.user.id,
          ...normalizeInvestmentInput(input),
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
          ...normalizeInvestmentInput(input.createInvestmentSchema),
        })
        .where(and(eq(investments.id, input.id), eq(investments.userId, ctx.user.id)))
        .returning({ id: investments.id });
    }),

  closeInvestment: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        closedAmount: amount,
        closedAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(investments)
        .set({
          isClosed: true,
          closedAt: input.closedAt ?? new Date(),
          amount: input.closedAmount,
        })
        .where(and(eq(investments.id, input.id), eq(investments.userId, ctx.user.id)))
        .returning({ id: investments.id });
    }),

  deleteInvestment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .delete(investments)
        .where(and(eq(investments.id, input.id), eq(investments.userId, ctx.user.id)))
        .returning({ id: investments.id });
    }),
});
