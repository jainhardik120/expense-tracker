import { subDays } from 'date-fns';
import { and, desc, eq, getTableColumns, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';

import { instrumentAssetClasses, investments } from '@/db/schema';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import {
  assetClassTagValues,
  canTagAssetClass,
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
  buildInstrumentChart,
  buildLivePortfolio,
  buildSavedPortfolio,
  searchInvestmentInstruments,
} from '@/server/helpers/investment';
import { getInvestmentsDashboard } from '@/server/helpers/investment/dashboard';
import { enrichInvestments } from '@/server/helpers/investment/enrichment';
import { buildFineTimeline } from '@/server/helpers/investment/intraday';
import { buildInvestmentMarketDataContext } from '@/server/helpers/investment/market-data';
import { getMarketIndicators } from '@/server/helpers/investment/market-indicators';
import {
  getMetalBuyPrices,
  getMetalCharts,
  getMetalPrices,
  metalChartRanges,
} from '@/server/helpers/investment/metal-prices';
import { attachPaymentTotals } from '@/server/helpers/investment/payments';
import { getMarketSplits } from '@/server/helpers/mutual-fund-analysis/market-split-loader';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { amount, createInvestmentSchema } from '@/types';

import { investmentPaymentsRouter } from './investment-payments';

const SEARCH_QUERY_MAX_LENGTH = 120;

const HISTORY_DAYS = 10;

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

const getFilteredInvestments = instrumentedFunction(
  'getFilteredInvestments',
  async (
    db: Database,
    userId: string,
    { start, end, investmentKind }: { start?: Date; end?: Date; investmentKind: string[] },
  ) =>
    db
      .select({
        ...getTableColumns(investments),
        assetClass: instrumentAssetClasses.assetClass,
      })
      .from(investments)
      .leftJoin(
        instrumentAssetClasses,
        and(
          eq(instrumentAssetClasses.userId, investments.userId),
          eq(instrumentAssetClasses.investmentKind, investments.investmentKind),
          eq(instrumentAssetClasses.instrumentCode, investments.instrumentCode),
        ),
      )
      .where(
        and(
          eq(investments.userId, userId),
          start === undefined ? undefined : gte(investments.investmentDate, start),
          end === undefined ? undefined : lte(investments.investmentDate, end),
          investmentKind.length === 0
            ? undefined
            : inArray(investments.investmentKind, investmentKind),
        ),
      )
      .orderBy(desc(investments.investmentDate)),
);

const portfolioFilterSchema = z.object({
  start: z.date().optional(),
  end: z.date().optional(),
  investmentKind: z.string().array().optional().default([]),
});

const overviewFigures = {
  invested: z.number(),
  valuation: z.number(),
  pnl: z.number(),
  pnlPercentage: z.number().nullable(),
  dayChange: z.number(),
  dayChangePercentage: z.number().nullable(),
  xirr: z.number().nullable(),
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
      label: z.string(),
      ...overviewFigures,
      openPositions: z.number(),
      totalPositions: z.number(),
    }),
  ),
  holdings: z.array(
    z.object({
      kind: z.enum(investmentKindValues),
      category: z.enum(investmentCategoryValues),
      label: z.string(),
      code: z.string(),
      name: z.string(),
      currency: z.string(),
      isRsu: z.boolean(),
      isExcludedFromPortfolio: z.boolean(),
      units: z.number(),
      ...overviewFigures,
      investedInr: z.number(),
      valuationInr: z.number(),
      dayChangeInr: z.number(),
      openPositions: z.number(),
      totalPositions: z.number(),
    }),
  ),
});

export const investmentsRouter = createTRPCRouter({
  payments: investmentPaymentsRouter,
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
      const today = new Date();
      const context = await buildInvestmentMarketDataContext({
        investmentsList: rows,
        historyStartDate: subDays(today, HISTORY_DAYS),
        historyEndDate: today,
      });
      const enriched = await enrichInvestments({
        investmentsList: rows,
        marketDataContext: context,
      });
      const dashboard = await getInvestmentsDashboard({
        investmentsList: enriched,
        start: today,
        end: today,
        historyByInstrumentKey: context.historyByInstrumentKey,
        usdInrHistory: context.usdInrHistory,
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
          xirr: dashboard.summary.xirr,
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
          xirr: row.xirr,
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
          investedInr: row.investedAmountInr,
          valuationInr: row.valuationAmountInr,
          dayChangeInr: row.dayChangeInr,
          invested: row.investedAmount,
          valuation: row.valuationAmount,
          pnl: row.pnl,
          pnlPercentage: row.pnlPercentage,
          dayChange: row.dayChange,
          dayChangePercentage: row.dayChangePercentage,
          xirr: row.xirr,
          openPositions: row.openPositions,
          totalPositions: row.totalPositions,
        })),
      };
    }),

  getInstrumentChart: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/investments/chart',
      },
    })
    .input(
      z.object({
        kind: z.enum(investmentKindValues),
        code: z.string().min(1),
        isRsu: z.stringbool().default(false),
        range: z.enum(investmentTimelineRangeValues).default('6m'),
      }),
    )
    .output(
      z.object({
        points: z.array(
          z.object({
            date: z.date(),
            unitPrice: z.number(),
            holdingValue: z.number(),
            investedAmount: z.number(),
          }),
        ),
        positions: z.array(
          z.object({
            id: z.string(),
            date: z.date(),
            units: z.number().nullable(),
            investedAmount: z.number(),
            valuationAmount: z.number(),
            isClosed: z.boolean(),
            closedAt: z.date().nullable(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(investments)
        .where(
          and(eq(investments.userId, ctx.user.id), eq(investments.instrumentCode, input.code)),
        );
      const matching = rows.filter(
        (row) =>
          normalizeInvestmentKind(row.investmentKind) === input.kind &&
          (input.kind !== 'stocks' || row.isRsu === input.isRsu),
      );
      return buildInstrumentChart({
        investmentsListRaw: matching,
        range: input.range,
        marketDataKinds: [input.kind],
      });
    }),

  getInvestmentsInitialData: protectedProcedure
    .input(portfolioFilterSchema)
    .query(async ({ ctx, input }) => {
      const rows = await getFilteredInvestments(ctx.db, ctx.user.id, input);
      const { positions, dashboard } = await buildSavedPortfolio(rows, input.end);
      return { positions: await attachPaymentTotals(ctx.db, positions), dashboard };
    }),

  getInvestmentsLive: protectedProcedure
    .input(portfolioFilterSchema)
    .query(async ({ ctx, input }) => {
      const rows = await getFilteredInvestments(ctx.db, ctx.user.id, input);
      const { positions, dashboard } = await buildLivePortfolio(rows, input.end);
      return { positions: await attachPaymentTotals(ctx.db, positions), dashboard };
    }),

  getMarketIndicators: protectedProcedure.query(async () => getMarketIndicators()),

  getMarketSplits: protectedProcedure.query(async ({ ctx }) =>
    getMarketSplits(
      ctx.db,
      await getFilteredInvestments(ctx.db, ctx.user.id, { investmentKind: [] }),
    ),
  ),

  getMetalPrices: protectedProcedure.query(async ({ ctx }) => getMetalPrices(ctx.db, ctx.user.id)),

  getMetalBuyPrices: protectedProcedure.query(async ({ ctx }) =>
    getMetalBuyPrices(ctx.db, ctx.user.id),
  ),

  getMetalCharts: protectedProcedure
    .input(z.object({ metal: z.enum(assetClassTagValues), range: z.enum(metalChartRanges) }))
    .query(async ({ ctx, input }) => getMetalCharts(ctx.db, ctx.user.id, input.metal, input.range)),

  getFineTimeline: protectedProcedure
    .input(
      z.object({
        start: z.date().optional(),
        end: z.date().optional(),
        investmentKind: z.string().array().optional().default([]),
        view: z.string(),
        range: z.enum(investmentTimelineRangeValues),
      }),
    )
    .query(async ({ ctx, input }) => {
      const investmentsListRaw = await getFilteredInvestments(ctx.db, ctx.user.id, input);
      return buildFineTimeline(investmentsListRaw, input.view, input.range);
    }),

  setAssetClass: protectedProcedure
    .input(
      z.object({
        kind: z.enum(investmentKindValues).refine(canTagAssetClass),
        code: z.string().min(1),
        assetClass: z.enum(assetClassTagValues).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const instrument = and(
        eq(instrumentAssetClasses.userId, ctx.user.id),
        eq(instrumentAssetClasses.investmentKind, input.kind),
        eq(instrumentAssetClasses.instrumentCode, input.code),
      );
      if (input.assetClass === null) {
        await ctx.db.delete(instrumentAssetClasses).where(instrument);
        return;
      }
      await ctx.db
        .insert(instrumentAssetClasses)
        .values({
          userId: ctx.user.id,
          investmentKind: input.kind,
          instrumentCode: input.code,
          assetClass: input.assetClass,
        })
        .onConflictDoUpdate({
          target: [
            instrumentAssetClasses.userId,
            instrumentAssetClasses.investmentKind,
            instrumentAssetClasses.instrumentCode,
          ],
          set: { assetClass: input.assetClass },
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

  createInvestment: protectedProcedure
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
