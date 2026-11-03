import { after } from 'next/server';

import { eq, inArray } from 'drizzle-orm';

import { mutualFundHoldings, mutualFundSchemes, stockProfiles } from '@/db/schema';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';

import { growwFundPortfolioProvider } from './groww-provider';

import type { FundPortfolioProvider, FundReturnStats } from './provider';

const MS_PER_DAY = 86_400_000;
const FUND_STALE_DAYS = 7;
const STOCK_STALE_DAYS = 30;
const STOCK_FETCH_CONCURRENCY = 8;
const EQUITY = 'EQUITY';

export type StoredFund = {
  schemeCode: string;
  schemeName: string;
  fundHouse: string | null;
  category: string | null;
  subCategory: string | null;
  expenseRatio: number | null;
  aumCrore: number | null;
  benchmark: string | null;
  portfolioTurnover: number | null;
  returnStats: FundReturnStats | null;
  portfolioDate: Date | null;
  fetchedAt: Date;
  holdings: Array<{
    companyName: string;
    stockRef: string | null;
    sector: string | null;
    assetType: string | null;
    instrument: string | null;
    rating: string | null;
    weightPercent: number;
    marketValueCrore: number | null;
  }>;
};

export type StoredStock = {
  name: string | null;
  industry: string | null;
  marketCapCrore: number | null;
};

const toNumber = (value: string | null) => (value === null ? null : Number.parseFloat(value));

const isStale = (fetchedAt: Date, days: number) =>
  Date.now() - fetchedAt.getTime() > days * MS_PER_DAY;

const refreshFund = async (
  db: Database,
  provider: FundPortfolioProvider,
  schemeCode: string,
  schemeName: string,
  knownProviderId: string | null,
) => {
  const providerId = knownProviderId ?? (await provider.resolveFund(schemeCode, schemeName));
  if (providerId === null) {
    return false;
  }
  const portfolio = await provider.fetchFund(providerId);
  if (portfolio === null) {
    return false;
  }
  const scheme = {
    providerId: portfolio.providerId,
    schemeName: portfolio.schemeName,
    fundHouse: portfolio.fundHouse,
    category: portfolio.category,
    subCategory: portfolio.subCategory,
    expenseRatio: portfolio.expenseRatio?.toString() ?? null,
    aumCrore: portfolio.aumCrore?.toString() ?? null,
    benchmark: portfolio.benchmark,
    portfolioTurnover: portfolio.portfolioTurnover?.toString() ?? null,
    returnStats: portfolio.returnStats,
    portfolioDate: portfolio.portfolioDate,
    fetchedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(mutualFundSchemes)
      .values({ schemeCode, ...scheme })
      .onConflictDoUpdate({ target: mutualFundSchemes.schemeCode, set: scheme });
    await tx.delete(mutualFundHoldings).where(eq(mutualFundHoldings.schemeCode, schemeCode));
    if (portfolio.holdings.length > 0) {
      await tx.insert(mutualFundHoldings).values(
        portfolio.holdings.map((holding) => ({
          schemeCode,
          companyName: holding.companyName,
          stockRef: holding.stockRef,
          sector: holding.sector,
          assetType: holding.assetType,
          instrument: holding.instrument,
          rating: holding.rating,
          weightPercent: holding.weightPercent.toString(),
          marketValueCrore: holding.marketValueCrore?.toString() ?? null,
        })),
      );
    }
  });
  return true;
};

const runPool = async <T>(items: T[], limit: number, task: (item: T) => Promise<void>) => {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        await task(item);
      }
    }),
  );
};

const refreshStocks = async (db: Database, provider: FundPortfolioProvider, refs: string[]) => {
  await runPool(refs, STOCK_FETCH_CONCURRENCY, async (stockRef) => {
    const profile = await provider.fetchStock(stockRef);
    if (profile === null) {
      return;
    }
    const values = {
      name: profile.name,
      industry: profile.industry,
      marketCapCrore: profile.marketCapCrore?.toString() ?? null,
      nseSymbol: profile.nseSymbol,
      bseCode: profile.bseCode,
      fetchedAt: new Date(),
    };
    await db
      .insert(stockProfiles)
      .values({ stockRef, ...values })
      .onConflictDoUpdate({ target: stockProfiles.stockRef, set: values });
  });
};

export const loadFundPortfolios = instrumentedFunction(
  'loadFundPortfolios',
  async (
    db: Database,
    funds: Array<{ schemeCode: string; schemeName: string }>,
    provider: FundPortfolioProvider = growwFundPortfolioProvider,
  ): Promise<{ funds: Map<string, StoredFund>; stocks: Map<string, StoredStock> }> => {
    const codes = funds.map((fund) => fund.schemeCode);
    if (codes.length === 0) {
      return { funds: new Map(), stocks: new Map() };
    }
    const known = await db
      .select({
        schemeCode: mutualFundSchemes.schemeCode,
        providerId: mutualFundSchemes.providerId,
        fetchedAt: mutualFundSchemes.fetchedAt,
      })
      .from(mutualFundSchemes)
      .where(inArray(mutualFundSchemes.schemeCode, codes));
    const knownByCode = new Map(known.map((row) => [row.schemeCode, row]));
    await Promise.all(
      funds
        .filter((fund) => {
          const row = knownByCode.get(fund.schemeCode);
          return row === undefined || isStale(row.fetchedAt, FUND_STALE_DAYS);
        })
        .map((fund) =>
          refreshFund(
            db,
            provider,
            fund.schemeCode,
            fund.schemeName,
            knownByCode.get(fund.schemeCode)?.providerId ?? null,
          ),
        ),
    );

    const [schemeRows, holdingRows] = await Promise.all([
      db.select().from(mutualFundSchemes).where(inArray(mutualFundSchemes.schemeCode, codes)),
      db.select().from(mutualFundHoldings).where(inArray(mutualFundHoldings.schemeCode, codes)),
    ]);
    const stored = new Map<string, StoredFund>(
      schemeRows.map((row) => [
        row.schemeCode,
        {
          schemeCode: row.schemeCode,
          schemeName: row.schemeName,
          fundHouse: row.fundHouse,
          category: row.category,
          subCategory: row.subCategory,
          expenseRatio: toNumber(row.expenseRatio),
          aumCrore: toNumber(row.aumCrore),
          benchmark: row.benchmark,
          portfolioTurnover: toNumber(row.portfolioTurnover),
          returnStats: row.returnStats as FundReturnStats | null,
          portfolioDate: row.portfolioDate,
          fetchedAt: row.fetchedAt,
          holdings: [],
        },
      ]),
    );
    for (const row of holdingRows) {
      stored.get(row.schemeCode)?.holdings.push({
        companyName: row.companyName,
        stockRef: row.stockRef,
        sector: row.sector,
        assetType: row.assetType,
        instrument: row.instrument,
        rating: row.rating,
        weightPercent: Number.parseFloat(row.weightPercent),
        marketValueCrore: toNumber(row.marketValueCrore),
      });
    }

    const refs = [
      ...new Set(
        holdingRows
          .filter((row) => row.assetType === EQUITY && row.stockRef !== null)
          .map((row) => row.stockRef as string),
      ),
    ];
    const stockRows =
      refs.length === 0
        ? []
        : await db.select().from(stockProfiles).where(inArray(stockProfiles.stockRef, refs));
    const fresh = new Set(
      stockRows
        .filter(
          (row) =>
            !isStale(row.fetchedAt, STOCK_STALE_DAYS) &&
            (row.nseSymbol !== null || row.bseCode !== null),
        )
        .map((row) => row.stockRef),
    );
    const stale = refs.filter((ref) => !fresh.has(ref));
    if (stale.length > 0) {
      after(() => refreshStocks(db, provider, stale));
    }
    const stocks = new Map(
      stockRows.map((row) => [
        row.stockRef,
        { name: row.name, industry: row.industry, marketCapCrore: toNumber(row.marketCapCrore) },
      ]),
    );
    return { funds: stored, stocks };
  },
);
