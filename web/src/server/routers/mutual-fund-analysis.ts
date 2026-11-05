import { subDays } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { investments } from '@/db/schema';
import { normalizeInvestmentKind } from '@/lib/investments';
import { getInvestmentsDashboard } from '@/server/helpers/investment/dashboard';
import { enrichInvestments } from '@/server/helpers/investment/enrichment';
import {
  buildInvestmentMarketDataContext,
  getHistoricalUnitPrices,
  loadFundQuotes,
} from '@/server/helpers/investment/market-data';
import { createInstrumentKey } from '@/server/helpers/investment/shared';
import { computeXirr, investmentCashFlows } from '@/server/helpers/investment/xirr';
import { analyseMutualFunds } from '@/server/helpers/mutual-fund-analysis/analysis';
import {
  benchmarkTimeline,
  compareWithBenchmark,
  extendToLastNav,
  withLatestNav,
} from '@/server/helpers/mutual-fund-analysis/benchmark';
import { getLiveFundPrices, getTodayEstimate } from '@/server/helpers/mutual-fund-analysis/live';
import { loadFundPortfolios } from '@/server/helpers/mutual-fund-analysis/store';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

const MUTUAL_FUNDS = 'mutual_funds';
const NAV_LOOKBACK_DAYS = 14;
const BENCHMARK_SCHEME_CODE = '120716';
const BENCHMARK_NAME = 'Nifty 50 index fund';
const BENCHMARK_LOOKBACK_DAYS = 10;

export const mutualFundAnalysisRouter = createTRPCRouter({
  getAnalysis: protectedProcedure.query(async ({ ctx }) => {
    const rows = (
      await ctx.db
        .select()
        .from(investments)
        .where(and(eq(investments.userId, ctx.user.id), eq(investments.isClosed, false)))
    ).filter((row) => normalizeInvestmentKind(row.investmentKind) === MUTUAL_FUNDS);
    const today = new Date();
    const context = await buildInvestmentMarketDataContext({
      investmentsList: rows,
      historyStartDate: subDays(today, NAV_LOOKBACK_DAYS),
      historyEndDate: today,
      marketDataKinds: [MUTUAL_FUNDS],
    });
    const enriched = await enrichInvestments({ investmentsList: rows, marketDataContext: context });
    const dashboard = await getInvestmentsDashboard({
      investmentsList: enriched,
      start: today,
      end: today,
      historyByInstrumentKey: context.historyByInstrumentKey,
      usdInrHistory: context.usdInrHistory,
    });
    const positions = dashboard.instrumentBreakdown
      .filter((row) => row.kind === MUTUAL_FUNDS && row.openPositions > 0)
      .map((row) => ({
        schemeCode: row.code,
        schemeName: row.name,
        value: row.valuationAmountInr,
        invested: row.investedAmountInr,
        xirr: row.xirr,
        navChange: row.dayChangeInr,
        navDate:
          context.quoteByInstrumentKey.get(createInstrumentKey(MUTUAL_FUNDS, row.code, null))
            ?.asOf ?? null,
      }));
    const { funds, stocks } = await loadFundPortfolios(
      ctx.db,
      positions.map((position) => ({
        schemeCode: position.schemeCode,
        schemeName: position.schemeName,
      })),
    );
    const analysis = analyseMutualFunds(positions, funds, stocks);
    const earliest = enriched.reduce(
      (min, investment) => (investment.investmentDate < min ? investment.investmentDate : min),
      today,
    );
    const indexHistory = await getHistoricalUnitPrices(
      MUTUAL_FUNDS,
      BENCHMARK_SCHEME_CODE,
      subDays(earliest, BENCHMARK_LOOKBACK_DAYS),
      today,
    );
    if (indexHistory.length === 0) {
      return { ...analysis, benchmark: null };
    }
    const historyStart = subDays(earliest, BENCHMARK_LOOKBACK_DAYS);
    const schemeCodes = [...new Set(positions.map((position) => position.schemeCode))];
    const [navQuotes, histories] = await Promise.all([
      loadFundQuotes([...schemeCodes, BENCHMARK_SCHEME_CODE]),
      Promise.all(
        schemeCodes.map(
          async (code) =>
            [code, await getHistoricalUnitPrices(MUTUAL_FUNDS, code, historyStart, today)] as const,
        ),
      ),
    ]);
    const quoteOf = (code: string) => navQuotes.get(createInstrumentKey(MUTUAL_FUNDS, code, null));
    const fundHistories = new Map(
      histories.map(([code, history]) => [code, withLatestNav(history, quoteOf(code))]),
    );
    const pricedIndex = withLatestNav(indexHistory, quoteOf(BENCHMARK_SCHEME_CODE));
    const latest = pricedIndex.at(-1) ?? { date: today, price: 0 };
    const timeline = benchmarkTimeline(
      enriched.map((investment) => ({
        schemeCode: investment.instrumentCode ?? '',
        date: investment.investmentDate,
        amount: investment.investedAmountInr,
        units: investment.units === null ? null : Number.parseFloat(investment.units),
      })),
      fundHistories,
      extendToLastNav(pricedIndex, [...fundHistories.values()]),
    );
    const comparison = compareWithBenchmark(
      enriched.map((investment) => ({
        schemeCode: investment.instrumentCode ?? '',
        date: investment.investmentDate,
        amount: investment.investedAmountInr,
      })),
      pricedIndex,
      latest.price,
      today,
    );
    return {
      ...analysis,
      benchmark: {
        name: BENCHMARK_NAME,
        navDate: latest.date,
        timeline,
        total: {
          ...comparison.total,
          value: analysis.totals.value,
          xirr: computeXirr(
            enriched.flatMap((investment) => investmentCashFlows(investment, today)),
          ),
        },
        funds: [...comparison.byFund.entries()].map(([schemeCode, result]) => ({
          schemeCode,
          ...result,
        })),
      },
    };
  }),
  getLivePrices: protectedProcedure.query(({ ctx }) => getLiveFundPrices(ctx.db, ctx.user.id)),
  getTodayEstimate: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/investments/today-estimate',
      },
    })
    .input(z.void())
    .output(
      z.object({
        marketOpen: z.boolean(),
        navDate: z.date().nullable(),
        oldestNavDate: z.date().nullable(),
        estimateDate: z.date().nullable(),
        percents: z.record(z.string(), z.number()),
      }),
    )
    .query(({ ctx }) => getTodayEstimate(ctx.db, ctx.user.id)),
});
