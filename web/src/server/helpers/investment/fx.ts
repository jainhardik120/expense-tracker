import { instrumentedFunction } from '@/lib/instrumentation';
import type { InvestmentKindValue, StockMarketValue } from '@/lib/investments';

import {
  DAY_IN_MS,
  DEFAULT_USER_AGENT,
  fetchJson,
  getFxRateToInrFromHistory,
  INR_CURRENCY,
  startOfDay,
  USD_CURRENCY,
} from './shared';
import { parseOptionalNumber } from './utils';

export const getInvestmentAmountInInr = ({
  investmentAmountRaw,
  investmentDate,
  normalizedKind,
  normalizedStockMarket,
  usdInrRate,
  usdInrHistory,
}: {
  investmentAmountRaw: string | null | undefined;
  investmentDate: Date;
  normalizedKind: InvestmentKindValue;
  normalizedStockMarket: StockMarketValue | null;
  usdInrRate: number | null;
  usdInrHistory: Array<{ date: Date; price: number }>;
}): {
  amountInr: number;
  amountNative: number;
  currency: 'INR' | 'USD';
  purchaseFxRateToInr: number | null;
  currentFxRateToInr: number | null;
  amountInrAtCurrentFx: number | null;
} => {
  const parsedAmount = parseOptionalNumber(investmentAmountRaw) ?? 0;
  if (normalizedKind === 'stocks' && normalizedStockMarket === 'US') {
    const purchaseFxRateToInr = getFxRateToInrFromHistory(
      investmentDate,
      usdInrHistory,
      usdInrRate,
    );
    const currentFxRateToInr =
      usdInrRate !== null && Number.isFinite(usdInrRate) && usdInrRate > 0 ? usdInrRate : null;
    const effectivePurchaseFx = purchaseFxRateToInr ?? currentFxRateToInr;
    return {
      amountInr: effectivePurchaseFx === null ? parsedAmount : parsedAmount * effectivePurchaseFx,
      amountNative: parsedAmount,
      currency: USD_CURRENCY,
      purchaseFxRateToInr,
      currentFxRateToInr,
      amountInrAtCurrentFx: currentFxRateToInr === null ? null : parsedAmount * currentFxRateToInr,
    };
  }
  return {
    amountInr: parsedAmount,
    amountNative: parsedAmount,
    currency: INR_CURRENCY,
    purchaseFxRateToInr: 1,
    currentFxRateToInr: 1,
    amountInrAtCurrentFx: parsedAmount,
  };
};

export const getUsdInrRate = instrumentedFunction(
  'getUsdInrRate',
  async (): Promise<number | null> => {
    const payload = await fetchJson<{
      quoteResponse?: {
        result?: Array<{ symbol?: string; regularMarketPrice?: number }>;
      };
    }>('https://query1.finance.yahoo.com/v7/finance/quote?symbols=USDINR%3DX', {
      cache: 'no-store',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
      },
    });

    const price = payload?.quoteResponse?.result?.[0]?.regularMarketPrice;
    if (price === undefined || !Number.isFinite(price) || price <= 0) {
      return null;
    }
    return price;
  },
);

export const getUsdInrHistory = instrumentedFunction(
  'getUsdInrHistory',
  async ({
    startDate,
    endDate,
  }: {
    startDate: Date;
    endDate: Date;
  }): Promise<Array<{ date: Date; price: number }>> => {
    const periodStart = Math.floor(startOfDay(startDate).getTime() / 1000);
    const periodEnd = Math.floor((startOfDay(endDate).getTime() + DAY_IN_MS) / 1000);
    const payload = await fetchJson<{
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    }>(
      `https://query1.finance.yahoo.com/v8/finance/chart/USDINR%3DX?interval=1d&period1=${periodStart}&period2=${periodEnd}`,
      {
        cache: 'no-store',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
        },
      },
    );

    const result = payload?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const points: Array<{ date: Date; price: number }> = [];
    for (const [index, timestamp] of timestamps.entries()) {
      const close = closes[index];
      if (close === null || !Number.isFinite(close) || close <= 0) {
        continue;
      }
      points.push({
        date: new Date(timestamp * 1000),
        price: close,
      });
    }
    return points;
  },
);
