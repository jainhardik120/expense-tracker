import { env } from '@/lib/env';
import { instrumentedFunction } from '@/lib/instrumentation';
import {
  normalizeStockMarket,
  type InvestmentKindValue,
  type StockMarketValue,
} from '@/lib/investments';
import { parseFloatSafe } from '@/server/helpers/emi-calculations';

export const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; ExpenseTracker/1.0)';
export const USD_CURRENCY = 'USD';
export const INR_CURRENCY = 'INR';

export const getCoinGeckoHeaders = (): HeadersInit => ({
  Accept: 'application/json',
  'x-cg-demo-api-key': env.COINGECKO_API_KEY,
});

export const parseMfDate = (value: string): Date | null => {
  const [day, month, year] = value.split('-').map((part) => Number(part));
  if (
    Number.isNaN(day) ||
    Number.isNaN(month) ||
    Number.isNaN(year) ||
    day < 1 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  return new Date(year, month - 1, day);
};

export const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const fetchJson = instrumentedFunction(
  'fetchJSON',
  async <T>(url: string, init?: RequestInit): Promise<T | null> => {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as T;
    } catch {
      return null;
    }
  },
);

export const createInstrumentKey = (
  kind: InvestmentKindValue,
  code: string,
  stockMarket: StockMarketValue | null = null,
): string => {
  if (kind === 'stocks') {
    return `${kind}:${normalizeStockMarket(stockMarket)}:${code}`;
  }
  return `${kind}:${code}`;
};

export const getYahooStockSymbol = (code: string, stockMarket: StockMarketValue): string => {
  const normalizedCode = code.trim().toUpperCase();
  if (stockMarket === 'US') {
    return normalizedCode;
  }
  return normalizedCode.includes('.') ? normalizedCode : `${normalizedCode}.NS`;
};

export const getFxRateToInrFromHistory = (
  date: Date,
  usdInrHistory: Array<{ date: Date; price: number }>,
  fallbackRate: number | null,
): number | null => {
  const targetTime = startOfDay(date).getTime();
  let latestRate: number | null = null;
  let latestTime = Number.MIN_SAFE_INTEGER;

  for (const point of usdInrHistory) {
    const pointTime = startOfDay(point.date).getTime();
    if (pointTime > targetTime || !Number.isFinite(point.price) || point.price <= 0) {
      continue;
    }
    if (pointTime >= latestTime) {
      latestRate = point.price;
      latestTime = pointTime;
    }
  }

  if (latestRate !== null) {
    return latestRate;
  }
  if (fallbackRate !== null && Number.isFinite(fallbackRate) && fallbackRate > 0) {
    return fallbackRate;
  }
  return null;
};

export const convertPriceToInr = ({
  unitPrice,
  nativeCurrencyRaw,
  usdInrRate,
}: {
  unitPrice: number;
  nativeCurrencyRaw: string | null | undefined;
  usdInrRate: number | null;
}): {
  unitPriceInr: number;
  nativeCurrency: string;
  fxRateToInr: number | null;
} | null => {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return null;
  }
  const nativeCurrency = (nativeCurrencyRaw ?? INR_CURRENCY).trim().toUpperCase();
  if (nativeCurrency === INR_CURRENCY) {
    return {
      unitPriceInr: unitPrice,
      nativeCurrency,
      fxRateToInr: 1,
    };
  }
  if (nativeCurrency === USD_CURRENCY) {
    const fxRateToInr =
      usdInrRate !== null && Number.isFinite(usdInrRate) && usdInrRate > 0 ? usdInrRate : null;
    if (fxRateToInr === null) {
      return null;
    }
    return {
      unitPriceInr: unitPrice * fxRateToInr,
      nativeCurrency,
      fxRateToInr,
    };
  }
  return null;
};

export const splitIntoChunks = <T>(items: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  let cursor = 0;
  while (cursor < items.length) {
    chunks.push(items.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }
  return chunks;
};

type MFScheme = {
  schemeCode: number;
  schemeName: string;
};

const MF_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let mfSchemesCache:
  | {
      items: MFScheme[];
      fetchedAt: number;
    }
  | undefined;

export const getMutualFundSchemes = async (): Promise<MFScheme[]> => {
  const now = Date.now();
  if (
    mfSchemesCache !== undefined &&
    now - mfSchemesCache.fetchedAt < MF_CACHE_TTL_MS &&
    mfSchemesCache.items.length > 0
  ) {
    return mfSchemesCache.items;
  }

  const payload = await fetchJson<MFScheme[]>('https://api.mfapi.in/mf', {
    cache: 'no-store',
  });
  const items = payload ?? [];
  mfSchemesCache = {
    items,
    fetchedAt: now,
  };
  return items;
};

export const parseNumericString = (value: string): number => parseFloatSafe(value);
