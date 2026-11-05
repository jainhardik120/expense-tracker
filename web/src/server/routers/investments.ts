import { subDays } from 'date-fns';
import { and, desc, eq, getTableColumns, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';

import { instrumentAssetClasses, investments } from '@/db/schema';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { toViewValue } from '@/lib/investment-selection';
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
import {
  getEtfEstimates,
  getMarketChart,
  getMarketSnapshot,
  getMetalBuyPrices,
  getMetalCharts,
  marketChartKeys,
  marketChartRanges,
  metalChartRanges,
} from '@/server/helpers/investment/metal-prices';
import { attachPaymentTotals } from '@/server/helpers/investment/payments';
import {
  getAllocationView,
  getMarketSplits,
} from '@/server/helpers/mutual-fund-analysis/market-split-loader';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { amount, createInvestmentSchema } from '@/types';

import { investmentPaymentsRouter } from './investment-payments';

const SEARCH_QUERY_MAX_LENGTH = 120;

const HISTORY_DAYS = 10;

const MIN_CHART_POINTS = 2;

const INDIVIDUAL_KINDS = new Set<string>(['fd', 'epfo']);

const FINE_CHART_RANGES = new Set<string>(['1d', '1w', '1m']);

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

const seriesPointSchema = z.object({ time: z.number(), price: z.number() });

const allocationSliceSchema = z.object({
  key: z.string(),
  colorKey: z.string(),
  label: z.string(),
  share: z.number(),
  invested: z.number(),
  value: z.number(),
  dayChange: z.number(),
});

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
  positions: z.array(
    z.object({
      id: z.string(),
      category: z.enum(investmentCategoryValues),
      name: z.string(),
      date: z.date(),
      invested: z.number(),
      valuation: z.number(),
      dayChange: z.number(),
      annualRate: z.number().nullable(),
      maturityDate: z.date().nullable(),
      isClosed: z.boolean(),
      isExcludedFromPortfolio: z.boolean(),
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
        positions: enriched
          .filter((position) => INDIVIDUAL_KINDS.has(position.normalizedKind))
          .map((position) => ({
            id: position.id,
            category: getInvestmentCategory(position.normalizedKind, position.isRsuPosition),
            name: position.instrumentName ?? position.instrumentCode ?? position.investmentKind,
            date: position.investmentDate,
            invested: position.investedAmountInr,
            valuation: position.valuationAmount ?? position.investedAmountInr,
            dayChange: position.dayChange ?? 0,
            annualRate:
              position.annualRate === null ? null : Number.parseFloat(position.annualRate),
            maturityDate: position.maturityDate,
            isClosed: position.isClosedPosition,
            isExcludedFromPortfolio: position.isExcludedFromPortfolioPosition,
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
            unitPriceDisplay: z.number(),
            holdingValueDisplay: z.number(),
          }),
        ),
        intraday: z.boolean(),
        positions: z.array(
          z.object({
            id: z.string(),
            date: z.date(),
            units: z.number().nullable(),
            investedAmount: z.number(),
            valuationAmount: z.number(),
            investedDisplay: z.number(),
            valuationDisplay: z.number(),
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
      const view = toViewValue(
        input.kind,
        input.code,
        input.kind === 'stocks' ? normalizeStockMarket(matching.at(0)?.stockMarket) : null,
      );
      const [chart, fine] = await Promise.all([
        buildInstrumentChart({
          investmentsListRaw: matching,
          range: input.range,
          marketDataKinds: [input.kind],
        }),
        FINE_CHART_RANGES.has(input.range) ? buildFineTimeline(matching, view, input.range) : null,
      ]);
      if (fine?.intraday !== true || fine.points.length < MIN_CHART_POINTS) {
        return { points: chart.points, positions: chart.positions, intraday: false };
      }
      return {
        points: fine.points.map((point) => ({
          date: point.date,
          unitPrice: point.unitPrice * chart.displayFxToInr,
          holdingValue: point.value * chart.displayFxToInr,
          investedAmount: point.base * chart.displayFxToInr,
          unitPriceDisplay: point.unitPrice,
          holdingValueDisplay: point.value,
        })),
        positions: chart.positions,
        intraday: true,
      };
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

  getMarketSplits: protectedProcedure.query(async ({ ctx }) =>
    getMarketSplits(
      ctx.db,
      await getFilteredInvestments(ctx.db, ctx.user.id, { investmentKind: [] }),
    ),
  ),

  getAllocation: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/investments/allocation',
      },
    })
    .input(z.void())
    .output(
      z.object({
        groups: z.array(
          allocationSliceSchema.extend({
            kinds: z.array(allocationSliceSchema),
            buckets: z.array(allocationSliceSchema),
          }),
        ),
        holdingsDate: z.date().nullable(),
      }),
    )
    .query(async ({ ctx }) =>
      getAllocationView(
        ctx.db,
        await getFilteredInvestments(ctx.db, ctx.user.id, { investmentKind: [] }),
      ),
    ),

  getMarketSnapshot: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/investments/markets',
      },
    })
    .input(z.void())
    .output(
      z.object({
        items: z.array(
          z.object({
            key: z.enum(marketChartKeys),
            label: z.string(),
            unit: z.string().nullable(),
            isCurrency: z.boolean(),
            price: z.number().nullable(),
            changePercentage: z.number().nullable(),
          }),
        ),
      }),
    )
    .query(async () => getMarketSnapshot()),

  getMarketChart: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/investments/markets/chart',
      },
    })
    .input(z.object({ key: z.enum(marketChartKeys), range: z.enum(marketChartRanges) }))
    .output(z.object({ points: z.array(z.object({ date: z.date(), price: z.number() })) }))
    .query(async ({ input }) => getMarketChart(input.key, input.range)),

  getEtfEstimates: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/investments/etf-estimate',
      },
    })
    .input(z.void())
    .output(z.object({ percents: z.record(z.string(), z.number()) }))
    .query(async ({ ctx }) => getEtfEstimates(ctx.db, ctx.user.id)),

  getMetalBuyPrices: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/investments/metal-buy-prices',
      },
    })
    .input(z.void())
    .output(
      z.array(
        z.object({
          code: z.enum(assetClassTagValues),
          etf: z.number().nullable(),
          mcx: z.number().nullable(),
          mcxCoverage: z.number(),
        }),
      ),
    )
    .query(async ({ ctx }) => getMetalBuyPrices(ctx.db, ctx.user.id)),

  getMetalCharts: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/investments/metal-charts',
      },
    })
    .input(z.object({ metal: z.enum(assetClassTagValues), range: z.enum(metalChartRanges) }))
    .output(
      z.object({
        unit: z.string(),
        etfSymbol: z.string(),
        start: z.number(),
        end: z.number(),
        etf: z.array(seriesPointSchema),
        etfEstimate: z.array(seriesPointSchema),
        mcx: z.array(seriesPointSchema),
        mcxEstimate: z.array(seriesPointSchema),
        comex: z.array(seriesPointSchema),
        india: z.array(seriesPointSchema),
      }),
    )
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
