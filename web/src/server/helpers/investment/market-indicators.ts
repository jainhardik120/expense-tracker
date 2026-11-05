import { instrumentedFunction } from '@/lib/instrumentation';
import { MS_PER_MINUTE, MS_PER_SECOND } from '@/types';

import { cachedQuotes } from './market-cache';
import { isIndianMarketOpen } from './market-hours';
import { fetchYahooChartQuote } from './providers/commodity-market-data';
import { DEFAULT_USER_AGENT, fetchLiveJson } from './shared';

import type { Quote } from './types';

const LIVE_TTL_MS = MS_PER_MINUTE;
const CLOSED_INDEX_TTL_MINUTES = 30;
const CLOSED_INDEX_TTL_MS = CLOSED_INDEX_TTL_MINUTES * MS_PER_MINUTE;
const PERCENT = 100;
const USD_INR_KEY = 'markets:usdinr';

const REQUEST_INIT: RequestInit = {
  cache: 'no-store',
  headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
};

const INDICES = [
  { key: 'markets:nifty', id: 'nifty', label: 'Nifty 50', exchange: 'NSE', symbol: 'NIFTY' },
  { key: 'markets:sensex', id: 'sensex', label: 'Sensex', exchange: 'BSE', symbol: 'SENSEX' },
] as const;

const US_INDICES = [
  { key: 'markets:sp500', id: 'sp500', label: 'S&P 500', symbol: '^GSPC' },
  { key: 'markets:nasdaq', id: 'nasdaq', label: 'Nasdaq', symbol: '^IXIC' },
  { key: 'markets:dow', id: 'dow', label: 'Dow Jones', symbol: '^DJI' },
] as const;

const fetchIndexQuote = async ({
  exchange,
  symbol,
}: (typeof INDICES)[number]): Promise<Quote | null> => {
  const payload = await fetchLiveJson<{ value?: number; close?: number; tsInMillis?: number }>(
    `https://groww.in/v1/api/stocks_data/v1/tr_live_indices/exchange/${exchange}/segment/CASH/${symbol}/latest`,
    REQUEST_INIT,
  );
  if (payload?.value === undefined) {
    return null;
  }
  return {
    unitPriceInr: payload.value,
    unitPriceNative: payload.value,
    nativeCurrency: 'INR',
    fxRateToInr: 1,
    asOf: payload.tsInMillis === undefined ? null : new Date(payload.tsInMillis * MS_PER_SECOND),
    source: 'groww',
    previousCloseInr: payload.close ?? null,
  };
};

const loadIndexQuotes = async () =>
  cachedQuotes(
    INDICES.map(({ key }) => ({
      key,
      ttlMs: isIndianMarketOpen(new Date()) ? LIVE_TTL_MS : CLOSED_INDEX_TTL_MS,
    })),
    async (keys) => {
      const quotes = new Map<string, Quote>();
      await Promise.all(
        INDICES.filter(({ key }) => keys.includes(key)).map(async (index) => {
          const quote = await fetchIndexQuote(index);
          if (quote !== null) {
            quotes.set(index.key, quote);
          }
        }),
      );
      return quotes;
    },
  );

const loadUsdInrQuote = async () =>
  cachedQuotes([{ key: USD_INR_KEY, ttlMs: LIVE_TTL_MS }], async () => {
    const quote = await fetchYahooChartQuote('USDINR=X', 'INR');
    return new Map(quote === null ? [] : [[USD_INR_KEY, quote]]);
  });

const loadUsIndexQuotes = async () =>
  cachedQuotes(
    US_INDICES.map(({ key }) => ({ key, ttlMs: LIVE_TTL_MS })),
    async (keys) => {
      const quotes = new Map<string, Quote>();
      await Promise.all(
        US_INDICES.filter(({ key }) => keys.includes(key)).map(async ({ key, symbol }) => {
          const quote = await fetchYahooChartQuote(symbol, 'USD');
          if (quote !== null) {
            quotes.set(key, quote);
          }
        }),
      );
      return quotes;
    },
  );

const toIndicator = (id: string, label: string, isCurrency: boolean, quote: Quote | undefined) => {
  const previous = quote?.previousCloseInr ?? null;
  return {
    id,
    label,
    isCurrency,
    price: quote?.unitPriceNative ?? null,
    changePercentage:
      quote === undefined || previous === null
        ? null
        : ((quote.unitPriceNative - previous) / previous) * PERCENT,
    asOf: quote?.asOf ?? null,
  };
};

export const getMarketIndicators = instrumentedFunction('getMarketIndicators', async () => {
  const [indexQuotes, usQuotes, usdInrQuotes] = await Promise.all([
    loadIndexQuotes(),
    loadUsIndexQuotes(),
    loadUsdInrQuote(),
  ]);
  return [
    ...INDICES.map(({ key, id, label }) => toIndicator(id, label, false, indexQuotes.get(key))),
    ...US_INDICES.map(({ key, id, label }) => toIndicator(id, label, false, usQuotes.get(key))),
    toIndicator('usdinr', 'USD/INR', true, usdInrQuotes.get(USD_INR_KEY)),
  ];
});
