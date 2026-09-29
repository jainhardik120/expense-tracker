import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';

import { investments } from '@/db/schema';
import type { Database } from '@/lib/db';
import {
  getInvestmentCategory,
  investmentCategoryLabels,
  investmentCategoryValues,
  investmentKindLabels,
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
} from '@/server/helpers/investment';
import { getInvestmentsDashboard } from '@/server/helpers/investment/dashboard';
import { enrichInvestments } from '@/server/helpers/investment/enrichment';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { amount, createInvestmentSchema, investmentParserSchema } from '@/types';

const SEARCH_QUERY_MAX_LENGTH = 120;

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

const getFilteredInvestments = async ({
  ctx,
  input,
}: {
  ctx: { db: Database; user: { id: string } };
  input: z.infer<typeof investmentParserSchema>;
}) => {
  const conditions = buildFilteredConditions({
    userId: ctx.user.id,
    start: input.start,
    end: input.end,
    investmentKind: input.investmentKind,
  });
  return ctx.db
    .select()
    .from(investments)
    .where(and(...conditions))
    .orderBy(desc(investments.investmentDate));
};

/**
 * The portfolio as one screenful, for a phone.
 *
 * The web page fetches a dashboard, several timelines and a paged table, and
 * redraws parts of it as the user changes range. A phone screen and a
 * home-screen widget want none of that: they want today's figure, what it cost,
 * and what moved. So this is a single read with no history in it.
 */
const overviewFigures = {
  invested: z.number(),
  valuation: z.number(),
  pnl: z.number(),
  pnlPercentage: z.number().nullable(),
  dayChange: z.number(),
  dayChangePercentage: z.number().nullable(),
};

const investmentsOverviewSchema = z.object({
  asOf: z.date(),
  summary: z.object({
    ...overviewFigures,
    openPositions: z.number(),
    closedPositions: z.number(),
    totalPositions: z.number(),
  }),
  categories: z.array(
    z.object({
      category: z.enum(investmentCategoryValues),
      /** Resolved here so the phone does not keep its own copy of the labels. */
      label: z.string(),
      ...overviewFigures,
      openPositions: z.number(),
      totalPositions: z.number(),
    }),
  ),
  holdings: z.array(
    z.object({
      kind: z.enum(investmentKindValues),
      /** The bucket it belongs to above -- RSUs split out of plain stocks. */
      category: z.enum(investmentCategoryValues),
      label: z.string(),
      code: z.string(),
      name: z.string(),
      currency: z.string(),
      isRsu: z.boolean(),
      /** RSUs and the like are shown, but are not part of the totals above. */
      isExcludedFromPortfolio: z.boolean(),
      units: z.number(),
      ...overviewFigures,
      openPositions: z.number(),
      totalPositions: z.number(),
    }),
  ),
});

export const investmentsRouter = createTRPCRouter({
  getOverview: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/investments',
      },
    })
    .input(z.void())
    .output(investmentsOverviewSchema)
    .query(async ({ ctx }) => {
      const rows = await ctx.db
        .select()
        .from(investments)
        .where(eq(investments.userId, ctx.user.id))
        .orderBy(desc(investments.investmentDate));
      const enriched = await enrichInvestments({ investmentsList: rows });
      // Today for both ends of the range: the dashboard builds a daily series
      // between them, and a series nothing here reads should not cost a day of
      // market history per year the portfolio has existed.
      const today = new Date();
      const dashboard = await getInvestmentsDashboard({
        investmentsList: enriched,
        start: today,
        end: today,
      });

      return {
        asOf: today,
        summary: {
          invested: dashboard.summary.investedAmount,
          valuation: dashboard.summary.valuationAmount,
          pnl: dashboard.summary.pnl,
          pnlPercentage: dashboard.summary.pnlPercentage,
          dayChange: dashboard.summary.dayChange,
          dayChangePercentage: dashboard.summary.dayChangePercentage,
          openPositions: dashboard.summary.openPositions,
          closedPositions: dashboard.summary.closedPositions,
          totalPositions: dashboard.summary.totalPositions,
        },
        categories: dashboard.categoryBreakdown.map((row) => ({
          category: row.category,
          label: investmentCategoryLabels[row.category],
          invested: row.investedAmount,
          valuation: row.valuationAmount,
          pnl: row.pnl,
          pnlPercentage: row.pnlPercentage,
          dayChange: row.dayChange,
          dayChangePercentage: row.dayChangePercentage,
          openPositions: row.openPositions,
          totalPositions: row.totalPositions,
        })),
        holdings: dashboard.instrumentBreakdown.map((row) => ({
          kind: row.kind,
          category: getInvestmentCategory(row.kind, row.isRsu),
          label: investmentKindLabels[row.kind],
          code: row.code,
          name: row.name,
          currency: row.displayCurrency,
          isRsu: row.isRsu,
          isExcludedFromPortfolio: row.isExcludedFromPortfolio,
          units: row.units,
          invested: row.investedAmount,
          valuation: row.valuationAmount,
          pnl: row.pnl,
          pnlPercentage: row.pnlPercentage,
          dayChange: row.dayChange,
          dayChangePercentage: row.dayChangePercentage,
          openPositions: row.openPositions,
          totalPositions: row.totalPositions,
        })),
      };
    }),

  getInvestmentsPageData: protectedProcedure
    .input(investmentParserSchema)
    .query(async ({ ctx, input }) => {
      const investmentsListRaw = await getFilteredInvestments({ ctx, input });
      return buildInvestmentsPageData({
        investmentsListRaw,
        page: input.page,
        perPage: input.perPage,
        endDate: input.end,
      });
    }),

  getInvestmentsInitialData: protectedProcedure
    .input(investmentParserSchema)
    .query(async ({ ctx, input }) => {
      const investmentsListRaw = await getFilteredInvestments({ ctx, input });
      return buildInvestmentsPageData({
        investmentsListRaw,
        page: input.page,
        perPage: input.perPage,
        endDate: input.end,
        marketDataKinds: [],
      });
    }),

  getInvestmentsMarketDataByType: protectedProcedure
    .input(
      investmentParserSchema.extend({
        investmentType: z.enum(investmentKindValues),
      }),
    )
    .query(async ({ ctx, input }) => {
      const investmentsListRaw = await getFilteredInvestments({ ctx, input });
      const typeInvestments = investmentsListRaw.filter(
        (investment) => normalizeInvestmentKind(investment.investmentKind) === input.investmentType,
      );
      return buildInvestmentsPageData({
        investmentsListRaw: typeInvestments,
        page: 0,
        perPage: Math.max(1, typeInvestments.length),
        endDate: input.end,
        marketDataKinds: [input.investmentType],
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

  getInvestmentsTimelinesByType: protectedProcedure
    .input(
      z.object({
        start: z.date().optional(),
        end: z.date().optional(),
        investmentKind: z.string().array().optional().default([]),
        range: z.enum(investmentTimelineRangeValues),
        investmentType: z.enum(investmentKindValues),
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
      const typeInvestments = investmentsListRaw.filter(
        (investment) => normalizeInvestmentKind(investment.investmentKind) === input.investmentType,
      );
      return buildInvestmentsRangeTimelines({
        investmentsListRaw: typeInvestments,
        range: input.range,
        endDate: input.end,
        marketDataKinds: [input.investmentType],
      });
    }),

  searchInstruments: protectedProcedure
    .input(
      z.object({
        kind: z.enum(investmentKindValues),
        stockMarket: z.enum(stockMarketValues).optional().default('IN'),
        query: z.string().trim().max(SEARCH_QUERY_MAX_LENGTH),
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
