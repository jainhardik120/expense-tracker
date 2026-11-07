import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { investments, mutualFundHoldings, stockProfiles } from '@/db/schema';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { normalizeInvestmentKind } from '@/lib/investments';
import { growwDayOpen, istDay } from '@/server/helpers/groww/client';
import { cachedQuotes } from '@/server/helpers/investment/market-cache';
import { loadFundQuotes } from '@/server/helpers/investment/market-data';
import { isIndianMarketOpen } from '@/server/helpers/investment/market-hours';
import { IndiaStockInvestmentProvider } from '@/server/helpers/investment/providers/india-stock-investment-provider';
import { parseIndianListing } from '@/server/helpers/investment/providers/indian-listing';
import { createInstrumentKey } from '@/server/helpers/investment/shared';
import { MS_PER_MINUTE } from '@/types';

import { estimateFundPercents } from './today-estimate';

const CLOSED_TTL_MINUTES = 30;
const OPEN_TTL_MS = MS_PER_MINUTE;
const CLOSED_TTL_MS = CLOSED_TTL_MINUTES * MS_PER_MINUTE;
const PERCENT = 100;
const MUTUAL_FUNDS = 'mutual_funds';
const EQUITY = 'EQUITY';
const DAY_KEY_LENGTH = 10;
const OPEN_BATCH = 10;

const indiaStocks = new IndiaStockInvestmentProvider();

type LiveQuote = {
  price: number;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
};

const heldFundCodes = async (db: Database, userId: string) => {
  const held = await db
    .select({ kind: investments.investmentKind, code: investments.instrumentCode })
    .from(investments)
    .where(and(eq(investments.userId, userId), eq(investments.isClosed, false)));
  return [
    ...new Set(
      held
        .filter((row) => normalizeInvestmentKind(row.kind) === MUTUAL_FUNDS && row.code !== null)
        .map((row) => row.code as string),
    ),
  ];
};

const dayKey = (date: Date) => date.toISOString().slice(0, DAY_KEY_LENGTH);

export const listingCode = (listing: { nseSymbol: string | null; bseCode: string | null }) => {
  if (listing.nseSymbol !== null) {
    return `${listing.nseSymbol}.NS`;
  }
  return listing.bseCode === null ? null : `${listing.bseCode}.BO`;
};

export const loadListedQuotes = async (codes: string[], marketOpen: boolean) => {
  const instruments = [...new Set(codes)].map((code) => ({
    kind: 'stocks' as const,
    code,
    stockMarket: 'IN' as const,
  }));
  return cachedQuotes(
    instruments.map((instrument) => ({
      key: createInstrumentKey('stocks', instrument.code, 'IN'),
      ttlMs: marketOpen ? OPEN_TTL_MS : CLOSED_TTL_MS,
    })),
    () => indiaStocks.getLiveQuotes(instruments),
  );
};

const openByDay = new Map<string, number>();

const loadOpen = async (code: string, day: Date) => {
  const key = `${code}:${dayKey(day)}`;
  const known = openByDay.get(key);
  if (known !== undefined) {
    return known;
  }
  const { exchange, symbol } = parseIndianListing(code);
  const open = await growwDayOpen(exchange, symbol, day);
  if (open !== null) {
    openByDay.set(key, open);
  }
  return open;
};

export const loadListedOpens = async (codes: string[], moment: Date) => {
  const day = istDay(moment.getTime());
  const unique = [...new Set(codes)];
  const opens = new Map<string, number>();
  for (let index = 0; index < unique.length; index += OPEN_BATCH) {
    const batch = unique.slice(index, index + OPEN_BATCH);
    const prices = await Promise.all(batch.map(async (code) => loadOpen(code, day)));
    batch.forEach((code, position) => {
      const price = prices[position];
      if (price !== null) {
        opens.set(code, price);
      }
    });
  }
  return opens;
};

export const getLiveFundPrices = instrumentedFunction(
  'getLiveFundPrices',
  async (db: Database, userId: string) => {
    const now = new Date();
    const codes = await heldFundCodes(db, userId);
    const listings =
      codes.length === 0
        ? []
        : await db
            .selectDistinct({
              stockRef: stockProfiles.stockRef,
              nseSymbol: stockProfiles.nseSymbol,
              bseCode: stockProfiles.bseCode,
            })
            .from(mutualFundHoldings)
            .innerJoin(stockProfiles, eq(stockProfiles.stockRef, mutualFundHoldings.stockRef))
            .where(
              and(
                inArray(mutualFundHoldings.schemeCode, codes),
                eq(mutualFundHoldings.assetType, EQUITY),
                isNotNull(mutualFundHoldings.stockRef),
              ),
            );
    const codeByRef = new Map<string, string>();
    for (const listing of listings) {
      const code = listingCode(listing);
      if (code !== null) {
        codeByRef.set(listing.stockRef, code);
      }
    }
    const marketOpen = isIndianMarketOpen(now);
    const quoteByKey = await loadListedQuotes([...codeByRef.values()], marketOpen);
    const quotes: Record<string, LiveQuote> = {};
    let latest = 0;
    for (const [stockRef, code] of codeByRef) {
      const quote = quoteByKey.get(createInstrumentKey('stocks', code, 'IN'));
      if (quote === undefined) {
        continue;
      }
      const previousClose = quote.previousCloseInr ?? null;
      const dayChange = previousClose === null ? null : quote.unitPriceInr - previousClose;
      quotes[stockRef] = {
        price: quote.unitPriceInr,
        previousClose,
        dayChange,
        dayChangePercent:
          dayChange === null || previousClose === 0 || previousClose === null
            ? null
            : (dayChange / previousClose) * PERCENT,
      };
      latest = Math.max(latest, quote.asOf?.getTime() ?? 0);
    }
    const tradingDay = latest === 0 ? null : dayKey(istDay(latest));
    return {
      marketOpen: marketOpen && tradingDay === dayKey(istDay(now.getTime())),
      asOf: latest === 0 ? null : new Date(latest),
      tradingDay,
      quotes,
    };
  },
);

export const getTodayEstimate = instrumentedFunction(
  'getTodayEstimate',
  async (db: Database, userId: string) => {
    const codes = await heldFundCodes(db, userId);
    const [live, holdings, navQuotes] = await Promise.all([
      getLiveFundPrices(db, userId),
      codes.length === 0
        ? []
        : db
            .select({
              schemeCode: mutualFundHoldings.schemeCode,
              stockRef: mutualFundHoldings.stockRef,
              weightPercent: mutualFundHoldings.weightPercent,
            })
            .from(mutualFundHoldings)
            .where(
              and(
                inArray(mutualFundHoldings.schemeCode, codes),
                eq(mutualFundHoldings.assetType, EQUITY),
                isNotNull(mutualFundHoldings.stockRef),
              ),
            ),
      loadFundQuotes(codes),
    ]);
    const navDates = new Map(
      codes.flatMap((code) => {
        const asOf = navQuotes.get(createInstrumentKey(MUTUAL_FUNDS, code))?.asOf;
        return asOf === null || asOf === undefined ? [] : [[code, asOf] as const];
      }),
    );
    const changeByRef = new Map(
      Object.entries(live.quotes).flatMap(([stockRef, quote]) =>
        quote.dayChangePercent === null ? [] : [[stockRef, quote.dayChangePercent] as const],
      ),
    );
    const times = [...navDates.values()].map((date) => date.getTime());
    return {
      marketOpen: live.marketOpen,
      navDate: times.length === 0 ? null : new Date(Math.max(...times)),
      oldestNavDate: times.length === 0 ? null : new Date(Math.min(...times)),
      estimateDate: live.asOf,
      percents:
        live.asOf === null
          ? {}
          : estimateFundPercents(
              holdings.map((holding) => ({
                schemeCode: holding.schemeCode,
                stockRef: holding.stockRef ?? '',
                weightPercent: Number.parseFloat(holding.weightPercent),
              })),
              changeByRef,
              new Map([...navDates].map(([code, date]) => [code, dayKey(date)])),
              live.tradingDay ?? '',
            ),
    };
  },
);
