import { growwSearch } from '@/server/helpers/groww/client';
import { fetchJson } from '@/server/helpers/investment/shared';

import { parseCroreValue, toNumber } from './parse';

import type {
  FundPortfolio,
  FundPortfolioProvider,
  FundReturnStats,
  StockProfile,
} from './provider';

const BASE_URL = 'https://groww.in/v1/api';
const REQUEST_INIT: RequestInit = {
  cache: 'no-store',
  headers: {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36',
    Accept: 'application/json',
  },
};
type StatRow = {
  type?: string;
  stat_1y?: number | null;
  stat_3y?: number | null;
  stat_5y?: number | null;
};

type SchemeResponse = {
  search_id?: string;
  scheme_name?: string;
  fund_house?: string | null;
  category?: string | null;
  sub_category?: string | null;
  expense_ratio?: string | number | null;
  aum?: number | null;
  benchmark_name?: string | null;
  portfolio_turnover?: number | null;
  stats?: StatRow[];
  holdings?: Array<{
    portfolio_date?: string | null;
    company_name?: string | null;
    nature_name?: string | null;
    sector_name?: string | null;
    instrument_name?: string | null;
    rating?: string | null;
    market_value?: number | null;
    corpus_per?: number | null;
    stock_search_id?: string | null;
  }>;
};

type StockResponse = {
  header?: {
    displayName?: string | null;
    industryName?: string | null;
    nseScriptCode?: string | null;
    bseScriptCode?: string | null;
  };
  fundamentals?: Array<{ name?: string; value?: string | null }>;
};

const statsFor = (rows: StatRow[], type: string) => {
  const row = rows.find((item) => item.type === type);
  return { '1y': row?.stat_1y ?? null, '3y': row?.stat_3y ?? null, '5y': row?.stat_5y ?? null };
};

const searchQueries = (schemeName: string) => {
  const base = schemeName.split(' - ')[0]?.trim() ?? schemeName;
  return [...new Set([schemeName, base, `${base} Direct Growth`])];
};

export const growwFundPortfolioProvider: FundPortfolioProvider = {
  resolveFund: async (schemeCode, schemeName) => {
    for (const query of searchQueries(schemeName)) {
      const hits = await growwSearch(query, 'scheme');
      const match = hits.find(
        (item) => item.entity_type === 'Scheme' && item.scheme_code === schemeCode,
      );
      if (match?.search_id !== undefined) {
        return match.search_id;
      }
    }
    return null;
  },
  fetchFund: async (providerId) => {
    const response = await fetchJson<SchemeResponse>(
      `${BASE_URL}/data/mf/web/v4/scheme/search/${encodeURIComponent(providerId)}`,
      REQUEST_INIT,
    );
    if (response?.scheme_name === undefined) {
      return null;
    }
    const stats = response.stats ?? [];
    const returnStats: FundReturnStats = {
      fund: statsFor(stats, 'FUND_RETURN'),
      category: statsFor(stats, 'CATEGORY_AVG_RETURN'),
      rank: statsFor(stats, 'RANK_WITHIN_CATEGORY'),
    };
    const holdings = (response.holdings ?? []).flatMap((holding) => {
      const weight = toNumber(holding.corpus_per);
      if (weight === null || holding.company_name === null || holding.company_name === undefined) {
        return [];
      }
      return [
        {
          companyName: holding.company_name.trim(),
          stockRef: holding.stock_search_id ?? null,
          sector: holding.sector_name ?? null,
          assetType: holding.nature_name ?? null,
          instrument: holding.instrument_name ?? null,
          rating: holding.rating ?? null,
          weightPercent: weight,
          marketValueCrore: toNumber(holding.market_value),
        },
      ];
    });
    const portfolioDate = response.holdings?.find(
      (holding) => holding.portfolio_date !== null && holding.portfolio_date !== undefined,
    )?.portfolio_date;
    const portfolio: FundPortfolio = {
      providerId: response.search_id ?? providerId,
      schemeName: response.scheme_name,
      fundHouse: response.fund_house ?? null,
      category: response.category ?? null,
      subCategory: response.sub_category ?? null,
      expenseRatio: toNumber(response.expense_ratio),
      aumCrore: toNumber(response.aum),
      benchmark: response.benchmark_name ?? null,
      portfolioTurnover: toNumber(response.portfolio_turnover),
      returnStats,
      portfolioDate:
        portfolioDate === null || portfolioDate === undefined ? null : new Date(portfolioDate),
      holdings,
    };
    return portfolio;
  },
  fetchStock: async (stockRef) => {
    const response = await fetchJson<StockResponse>(
      `${BASE_URL}/stocks_data/v1/company/search_id/${encodeURIComponent(stockRef)}?page=0&size=10`,
      REQUEST_INIT,
    );
    if (response === null) {
      return null;
    }
    const marketCap = response.fundamentals?.find((item) => item.name === 'Market Cap')?.value;
    const profile: StockProfile = {
      name: response.header?.displayName ?? null,
      industry: response.header?.industryName ?? null,
      marketCapCrore: parseCroreValue(marketCap),
      nseSymbol: response.header?.nseScriptCode ?? null,
      bseCode: response.header?.bseScriptCode ?? null,
    };
    return profile;
  },
};
