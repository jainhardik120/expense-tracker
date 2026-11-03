import { and, eq } from 'drizzle-orm';

import { investments } from '@/db/schema';
import { normalizeInvestmentKind } from '@/lib/investments';
import { getInvestmentsDashboard } from '@/server/helpers/investment/dashboard';
import { enrichInvestments } from '@/server/helpers/investment/enrichment';
import { buildInvestmentMarketDataContext } from '@/server/helpers/investment/market-data';
import { analyseMutualFunds } from '@/server/helpers/mutual-fund-analysis/analysis';
import { getLiveFundPrices } from '@/server/helpers/mutual-fund-analysis/live';
import { loadFundPortfolios } from '@/server/helpers/mutual-fund-analysis/store';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

const MUTUAL_FUNDS = 'mutual_funds';

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
      historyStartDate: today,
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
      }));
    const { funds, stocks } = await loadFundPortfolios(
      ctx.db,
      positions.map((position) => ({
        schemeCode: position.schemeCode,
        schemeName: position.schemeName,
      })),
    );
    return analyseMutualFunds(positions, funds, stocks);
  }),
  getLivePrices: protectedProcedure.query(({ ctx }) => getLiveFundPrices(ctx.db, ctx.user.id)),
});
