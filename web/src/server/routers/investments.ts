import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';

import { investments } from '@/db/schema';
import {
  investmentKindValues,
  investmentTimelineRangeValues,
  normalizeInvestmentKind,
  normalizeStockMarket,
  stockMarketValues,
} from '@/lib/investments';
import {
  buildInvestmentsPageData,
  buildInvestmentsRangeTimelines,
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

const normalizeInvestmentInput = (input: z.infer<typeof createInvestmentSchema>) => {
  const normalizedKind = normalizeInvestmentKind(input.investmentKind);
  return {
    investmentKind: normalizedKind,
    instrumentCode: optionalToNull(input.instrumentCode),
    stockMarket: normalizedKind === 'stocks' ? normalizeStockMarket(input.stockMarket) : null,
    isRsu: normalizedKind === 'stocks' ? input.isRsu : false,
    investmentDate: input.investmentDate,
    investmentAmount: input.investmentAmount,
    maturityDate: optionalDateToNull(input.maturityDate),
    maturityAmount: optionalToNull(input.maturityAmount),
    units: optionalToNull(input.units),
    annualRate: optionalToNull(input.annualRate),
  };
};

const buildFilteredConditions = ({
  userId,
  start,
  end,
  investmentKind,
}: {
  userId: string;
  start?: Date;
  end?: Date;
  investmentKind: string[];
}) => {
  const conditions = [eq(investments.userId, userId)];
  if (start !== undefined) {
    conditions.push(gte(investments.investmentDate, start));
  }
  if (end !== undefined) {
    conditions.push(lte(investments.investmentDate, end));
  }
  if (investmentKind.length > 0) {
    conditions.push(inArray(investments.investmentKind, investmentKind));
  }
  return conditions;
};

export const investmentsRouter = createTRPCRouter({
  getInvestmentsPageData: protectedProcedure
    .input(investmentParserSchema)
    .query(async ({ ctx, input }) => {
      const conditions = buildFilteredConditions({
        userId: ctx.user.id,
        start: input.start,
        end: input.end,
        investmentKind: input.investmentKind,
      });
      const investmentsListRaw = await ctx.db
        .select()
        .from(investments)
        .where(and(...conditions))
        .orderBy(desc(investments.investmentDate));
      return buildInvestmentsPageData({
        investmentsListRaw,
        page: input.page,
        perPage: input.perPage,
        endDate: input.end,
      });
    }),

  getInvestmentsTimelines: protectedProcedure
    .input(
      z.object({
        start: z.date().optional(),
        end: z.date().optional(),
        investmentKind: z.string().array().optional().default([]),
        range: z.enum(investmentTimelineRangeValues),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = buildFilteredConditions({
        userId: ctx.user.id,
        start: input.start,
        end: input.end,
        investmentKind: input.investmentKind,
      });
      const investmentsListRaw = await ctx.db
        .select()
        .from(investments)
        .where(and(...conditions))
        .orderBy(desc(investments.investmentDate));
      return buildInvestmentsRangeTimelines({
        investmentsListRaw,
        range: input.range,
        endDate: input.end,
      });
    }),

  searchInstruments: protectedProcedure
    .input(
      z.object({
        kind: z.enum(investmentKindValues),
        stockMarket: z.enum(stockMarketValues).optional().default('IN'),
        query: z.string().trim().max(120),
      }),
    )
    .query(async ({ input }) => {
      return searchInvestmentInstruments(input.kind, input.query, input.stockMarket);
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
