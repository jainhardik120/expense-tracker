import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { investments, mutualFundHoldings, stockProfiles } from '@/db/schema';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { normalizeInvestmentKind } from '@/lib/investments';
import { istDay } from '@/server/helpers/groww/client';
import {
  cachedQuotes,
  loadInstrumentRows,
  storedQuote,
} from '@/server/helpers/investment/market-cache';
import { isIndianMarketOpen } from '@/server/helpers/investment/market-hours';
import { IndiaStockInvestmentProvider } from '@/server/helpers/investment/providers/india-stock-investment-provider';
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
      if (listing.nseSymbol !== null) {
        codeByRef.set(listing.stockRef, `${listing.nseSymbol}.NS`);
      } else if (listing.bseCode !== null) {
        codeByRef.set(listing.stockRef, `${listing.bseCode}.BO`);
      }
    }
    const marketOpen = isIndianMarketOpen(now);
    const instruments = [...new Set(codeByRef.values())].map((code) => ({
      kind: 'stocks' as const,
      code,
      stockMarket: 'IN' as const,
    }));
    const quoteByKey = await cachedQuotes(
      instruments.map((instrument) => ({
        key: createInstrumentKey('stocks', instrument.code, 'IN'),
        ttlMs: marketOpen ? OPEN_TTL_MS : CLOSED_TTL_MS,
      })),
      () => indiaStocks.getLiveQuotes(instruments),
    );
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
    return {
      marketOpen,
      asOf: latest === 0 ? null : new Date(latest),
      quotes,
    };
  },
);

export const getTodayEstimate = instrumentedFunction(
  'getTodayEstimate',
  async (db: Database, userId: string) => {
    const codes = await heldFundCodes(db, userId);
    const [live, holdings, navRows] = await Promise.all([
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
      loadInstrumentRows(codes.map((code) => createInstrumentKey(MUTUAL_FUNDS, code))),
    ]);
    const navDates = new Map(
      codes.flatMap((code) => {
        const asOf = storedQuote(navRows.get(createInstrumentKey(MUTUAL_FUNDS, code)))?.asOf;
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
              dayKey(istDay(live.asOf.getTime())),
            ),
    };
  },
);
