import { inArray } from 'drizzle-orm';

import { stockProfiles } from '@/db/schema';
import { buildAllocation } from '@/lib/asset-allocation';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { getAssetClass, normalizeInvestmentKind } from '@/lib/investments';
import { loadInstrumentRows } from '@/server/helpers/investment/market-cache';
import { isIndianMarketOpen } from '@/server/helpers/investment/market-hours';
import { getMarketChart, type marketChartRanges } from '@/server/helpers/investment/metal-prices';
import { buildLivePortfolio } from '@/server/helpers/investment/page-data';
import { parseIndianListing } from '@/server/helpers/investment/providers/indian-listing';
import { createInstrumentKey } from '@/server/helpers/investment/shared';
import type { InvestmentRow } from '@/server/helpers/investment/types';
import { getStockMarketFromInvestment } from '@/server/helpers/investment/utils';

import { growwEtfPortfolioProvider } from './groww-provider';
import { listingCode, loadListedOpens, loadListedQuotes } from './live';
import { INTERNATIONAL, splitFund, splitStock, type MarketSplit } from './market-split';
import { loadFundPortfolios, loadListedStocks } from './store';

export const getMarketSplits = instrumentedFunction(
  'getMarketSplits',
  async (db: Database, rows: InvestmentRow[]) => {
    const fundKeys = new Map<string, string>();
    const listedKeys = new Map<string, string>();
    const splits: MarketSplit[] = [];
    for (const row of rows) {
      const kind = normalizeInvestmentKind(row.investmentKind);
      const code = row.instrumentCode?.trim() ?? '';
      if (row.isClosed || code === '' || getAssetClass(kind, code, row.assetClass) !== 'market') {
        continue;
      }
      const market = getStockMarketFromInvestment(row);
      const instrumentKey = createInstrumentKey(kind, code, market);
      if (kind === 'mutual_funds') {
        fundKeys.set(code, instrumentKey);
      } else if (market === 'IN') {
        listedKeys.set(parseIndianListing(code).symbol, instrumentKey);
      } else if (!splits.some((split) => split.instrumentKey === instrumentKey)) {
        splits.push({ instrumentKey, parts: [{ bucket: INTERNATIONAL, share: 1 }] });
      }
    }
    const names = await loadInstrumentRows([...fundKeys.values()]);
    const listed = await loadListedStocks(db, [...listedKeys.keys()]);
    const [fundData, etfData] = await Promise.all([
      loadFundPortfolios(
        db,
        [...fundKeys.entries()].map(([schemeCode, instrumentKey]) => ({
          schemeCode,
          schemeName: names.get(instrumentKey)?.name ?? schemeCode,
        })),
      ),
      loadFundPortfolios(
        db,
        listed.etfs.map((symbol) => ({ schemeCode: symbol, schemeName: symbol })),
        growwEtfPortfolioProvider,
      ),
    ]);
    for (const [code, instrumentKey] of fundKeys) {
      splits.push({ instrumentKey, parts: splitFund(fundData.funds.get(code), fundData.stocks) });
    }
    for (const [symbol, instrumentKey] of listedKeys) {
      splits.push({
        instrumentKey,
        parts: listed.etfs.includes(symbol)
          ? splitFund(etfData.funds.get(symbol), etfData.stocks)
          : splitStock(listed.stocks.get(symbol)),
      });
    }
    const portfolioDates = [...fundData.funds.values()].flatMap((fund) =>
      fund.portfolioDate === null ? [] : [fund.portfolioDate.getTime()],
    );
    return {
      splits,
      holdingsDate: portfolioDates.length === 0 ? null : new Date(Math.min(...portfolioDates)),
    };
  },
);

export const indexKeys = ['nifty', 'sensex'] as const;

type MarketChartRange = (typeof marketChartRanges)[number];

type IndexKey = (typeof indexKeys)[number];

const INDEX_ETFS: Record<IndexKey, string> = { nifty: 'NIFTYBEES', sensex: 'SENSEXIETF' };

const PERCENT = 100;

export const getIndexComponents = instrumentedFunction(
  'getIndexComponents',
  async (db: Database, key: IndexKey, range: MarketChartRange) => {
    const symbol = INDEX_ETFS[key];
    const { funds, stocks } = await loadFundPortfolios(
      db,
      [{ schemeCode: symbol, schemeName: symbol }],
      growwEtfPortfolioProvider,
    );
    const fund = funds.get(symbol);
    const holdings = (fund?.holdings ?? []).flatMap((holding) =>
      holding.stockRef === null ? [] : [{ ...holding, stockRef: holding.stockRef }],
    );
    const refs = holdings.map((holding) => holding.stockRef);
    const listings =
      refs.length === 0
        ? []
        : await db
            .select({
              stockRef: stockProfiles.stockRef,
              nseSymbol: stockProfiles.nseSymbol,
              bseCode: stockProfiles.bseCode,
            })
            .from(stockProfiles)
            .where(inArray(stockProfiles.stockRef, refs));
    const codeByRef = new Map(
      listings.flatMap((listing) => {
        const code = listingCode(listing);
        return code === null ? [] : [[listing.stockRef, code] as const];
      }),
    );
    const codes = [...codeByRef.values()];
    const chartStart =
      range === '1d' ? undefined : (await getMarketChart(key, range)).points.at(0)?.date;
    const [quotes, opens] = await Promise.all([
      loadListedQuotes(codes, isIndianMarketOpen(new Date())),
      chartStart === undefined ? new Map<string, number>() : loadListedOpens(codes, chartStart),
    ]);
    return {
      etfName: fund?.schemeName ?? symbol,
      components: holdings
        .map((holding) => {
          const code = codeByRef.get(holding.stockRef);
          const quote =
            code === undefined ? undefined : quotes.get(createInstrumentKey('stocks', code, 'IN'));
          const base =
            range === '1d' ? (quote?.previousCloseInr ?? null) : (opens.get(code ?? '') ?? null);
          const price = quote?.unitPriceInr ?? null;
          return {
            name: stocks.get(holding.stockRef)?.name ?? holding.companyName,
            sector: stocks.get(holding.stockRef)?.industry ?? null,
            weight: holding.weightPercent,
            price,
            changePercent:
              price === null || base === null || base === 0
                ? null
                : ((price - base) / base) * PERCENT,
          };
        })
        .sort((left, right) => right.weight - left.weight),
    };
  },
);

export const getAllocationView = instrumentedFunction(
  'getAllocationView',
  async (db: Database, rows: InvestmentRow[]) => {
    const [{ dashboard }, { splits, holdingsDate }] = await Promise.all([
      buildLivePortfolio(rows),
      getMarketSplits(db, rows),
    ]);
    return { groups: buildAllocation(dashboard.assetAllocation, splits), holdingsDate };
  },
);
