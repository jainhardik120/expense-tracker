import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { getAssetClass, normalizeInvestmentKind } from '@/lib/investments';
import { loadInstrumentRows } from '@/server/helpers/investment/market-cache';
import { parseIndianListing } from '@/server/helpers/investment/providers/indian-listing';
import { createInstrumentKey } from '@/server/helpers/investment/shared';
import type { InvestmentRow } from '@/server/helpers/investment/types';
import { getStockMarketFromInvestment } from '@/server/helpers/investment/utils';

import { growwEtfPortfolioProvider } from './groww-provider';
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
