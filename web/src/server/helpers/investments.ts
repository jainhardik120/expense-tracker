import type { investments } from '@/db/schema';
import { instrumentedFunction } from '@/lib/instrumentation';
import {
  type InvestmentKindValue,
  isLivePriceInvestment,
  isUnitBasedInvestment,
  normalizeInvestmentKind,
} from '@/lib/investments';
import { parseFloatSafe } from '@/server/helpers/emi-calculations';

const YEAR_IN_MS = 365.25 * 24 * 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; ExpenseTracker/1.0)';

type InvestmentRow = typeof investments.$inferSelect;

type Quote = {
  unitPriceInr: number;
  asOf: Date | null;
  source: string;
};

type QuoteRequest = {
  investmentId: string;
  code: string;
};

export type InvestmentInstrumentSearchResult = {
  code: string;
  name: string;
  kind: InvestmentKindValue;
  source: string;
};

export type InvestmentTimelinePoint = {
  date: Date;
  investedAmount: number;
  valuationAmount: number;
  pnl: number;
};

export type DashboardInstrumentOption = {
  kind: InvestmentKindValue;
  code: string;
  name: string;
  positionsCount: number;
  units: number;
  investedAmount: number;
  valuationAmount: number;
  pnl: number;
};

export type InvestmentsDashboard = {
  summary: {
    investedAmount: number;
    valuationAmount: number;
    pnl: number;
    openPositions: number;
    closedPositions: number;
    totalPositions: number;
  };
  kindBreakdown: Array<{
    kind: InvestmentKindValue;
    investedAmount: number;
    valuationAmount: number;
    pnl: number;
    openPositions: number;
    closedPositions: number;
    totalPositions: number;
  }>;
  timeline: InvestmentTimelinePoint[];
  instrumentOptions: DashboardInstrumentOption[];
};

export type InstrumentHoldingTimelinePoint = {
  date: Date;
  unitPrice: number;
  unitsHeld: number;
  holdingValue: number;
};

export type InstrumentHoldingTimeline = {
  points: InstrumentHoldingTimelinePoint[];
  summary: {
    unitsHeld: number;
    investedAmount: number;
    latestHoldingValue: number;
    pnl: number;
  };
};

export type EnrichedInvestment = InvestmentRow & {
  normalizedKind: InvestmentKindValue;
  instrumentName: string | null;
  isClosedPosition: boolean;
  liveUnitPrice: number | null;
  valuationAmount: number | null;
  pnl: number | null;
  pnlPercentage: number | null;
  valuationSource: string | null;
  valuationDate: Date | null;
};

const parseOptionalNumber = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = parseFloatSafe(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseMfDate = (value: string): Date | null => {
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

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const clampDateInRange = (date: Date, rangeStart: Date, rangeEnd: Date): Date => {
  if (date.getTime() < rangeStart.getTime()) {
    return rangeStart;
  }
  if (date.getTime() > rangeEnd.getTime()) {
    return rangeEnd;
  }
  return date;
};

const buildDailyRange = (startDate: Date, endDate: Date): Date[] => {
  const normalizedStart = startOfDay(startDate);
  const normalizedEnd = startOfDay(endDate);
  if (normalizedStart.getTime() > normalizedEnd.getTime()) {
    return [];
  }

  const days: Date[] = [];
  let cursor = normalizedStart;
  while (cursor.getTime() <= normalizedEnd.getTime()) {
    days.push(cursor);
    cursor = new Date(cursor.getTime() + DAY_IN_MS);
  }
  return days;
};

const buildDailyPriceSeries = ({
  rawPoints,
  startDate,
  endDate,
  fallbackPrice,
}: {
  rawPoints: Array<{ date: Date; price: number }>;
  startDate: Date;
  endDate: Date;
  fallbackPrice?: number;
}): Array<{ date: Date; price: number }> => {
  const sorted = [...rawPoints].sort((left, right) => left.date.getTime() - right.date.getTime());
  const dayPriceMap = new Map<string, number>();
  for (const point of sorted) {
    dayPriceMap.set(dateToDayKey(point.date), point.price);
  }

  const days = buildDailyRange(startDate, endDate);
  let lastKnownPrice: number | undefined = fallbackPrice;
  return days.map((day) => {
    const key = dateToDayKey(day);
    const dayPrice = dayPriceMap.get(key);
    if (dayPrice !== undefined) {
      lastKnownPrice = dayPrice;
    }
    return {
      date: day,
      price: lastKnownPrice ?? 0,
    };
  });
};

const getFdValuationAtDate = (investment: InvestmentRow, valueDate: Date): number | null => {
  const principal = parseOptionalNumber(investment.investmentAmount);
  if (principal === null) {
    return null;
  }

  const manualValue = parseOptionalNumber(investment.amount);
  if (manualValue !== null) {
    return manualValue;
  }

  const maturityValue = parseOptionalNumber(investment.maturityAmount);
  const { maturityDate } = investment;
  const annualRate = parseOptionalNumber(investment.annualRate);
  const currentDate = valueDate;

  if (maturityValue !== null && maturityDate !== null) {
    if (currentDate >= maturityDate) {
      return maturityValue;
    }

    if (principal > 0) {
      const totalDuration = maturityDate.getTime() - investment.investmentDate.getTime();
      const elapsedDuration = currentDate.getTime() - investment.investmentDate.getTime();
      if (totalDuration > 0 && elapsedDuration > 0) {
        const elapsedRatio = Math.min(Math.max(elapsedDuration / totalDuration, 0), 1);
        const growthRatio = maturityValue / principal;
        if (growthRatio > 0) {
          return principal * Math.pow(growthRatio, elapsedRatio);
        }
      }
    }
  }

  if (annualRate !== null) {
    const heldYears = Math.max(
      (currentDate.getTime() - investment.investmentDate.getTime()) / YEAR_IN_MS,
      0,
    );
    return principal * Math.pow(1 + annualRate / 100, heldYears);
  }

  return principal;
};

const getFdValuation = (investment: InvestmentRow): number | null => {
  return getFdValuationAtDate(investment, new Date());
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T | null> => {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

type MFScheme = {
  schemeCode: number;
  schemeName: string;
};

const createInstrumentKey = (kind: InvestmentKindValue, code: string): string => `${kind}:${code}`;

const splitIntoChunks = <T>(items: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  let cursor = 0;
  while (cursor < items.length) {
    chunks.push(items.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }
  return chunks;
};

const MF_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let mfSchemesCache:
  | {
      items: MFScheme[];
      fetchedAt: number;
    }
  | undefined;

const getMutualFundSchemes = async (): Promise<MFScheme[]> => {
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

const searchStocks = async (query: string): Promise<InvestmentInstrumentSearchResult[]> => {
  const payload = await fetchJson<{
    quotes?: Array<{
      symbol?: string;
      shortname?: string;
      longname?: string;
      quoteType?: string;
      exchange?: string;
    }>;
  }>(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=25&newsCount=0`,
    {
      cache: 'no-store',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
      },
    },
  );

  const quotes = payload?.quotes ?? [];
  const filtered = quotes
    .filter((item) => item.quoteType === 'EQUITY')
    .filter((item) => {
      const symbol = item.symbol ?? '';
      const exchange = item.exchange ?? '';
      return (
        symbol.endsWith('.NS') ||
        symbol.endsWith('.BO') ||
        exchange.toUpperCase() === 'NSI' ||
        exchange.toUpperCase() === 'BSE'
      );
    })
    .slice(0, 20);

  return filtered.map((item) => ({
    code: item.symbol ?? '',
    name: item.longname ?? item.shortname ?? item.symbol ?? '',
    kind: 'stocks',
    source: 'yahoo-search',
  }));
};

const searchMutualFunds = async (query: string): Promise<InvestmentInstrumentSearchResult[]> => {
  const schemes = await getMutualFundSchemes();
  const normalized = query.toLowerCase().trim();

  return schemes
    .filter((item) => {
      const byName = item.schemeName.toLowerCase().includes(normalized);
      const byCode = String(item.schemeCode).includes(normalized);
      return byName || byCode;
    })
    .slice(0, 25)
    .map((item) => ({
      code: String(item.schemeCode),
      name: item.schemeName,
      kind: 'mutual_funds',
      source: 'mfapi.in',
    }));
};

const searchCrypto = async (query: string): Promise<InvestmentInstrumentSearchResult[]> => {
  const payload = await fetchJson<{
    coins?: Array<{
      id?: string;
      name?: string;
      symbol?: string;
      market_cap_rank?: number;
    }>;
  }>(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, {
    cache: 'no-store',
  });

  const coins = payload?.coins ?? [];
  const sorted = [...coins].sort((left, right) => {
    const leftRank = left.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });

  return sorted.slice(0, 20).map((coin) => {
    const name = coin.name ?? coin.id ?? '';
    const symbolSuffix = coin.symbol === undefined ? '' : ` (${coin.symbol.toUpperCase()})`;
    return {
      code: coin.id ?? '',
      name: `${name}${symbolSuffix}`,
      kind: 'crypto',
      source: 'coingecko',
    };
  });
};

const fdInstruments = [
  { code: 'SBI_FD', name: 'State Bank of India FD' },
  { code: 'HDFC_FD', name: 'HDFC Bank FD' },
  { code: 'ICICI_FD', name: 'ICICI Bank FD' },
  { code: 'AXIS_FD', name: 'Axis Bank FD' },
  { code: 'KOTAK_FD', name: 'Kotak Mahindra Bank FD' },
  { code: 'BOB_FD', name: 'Bank of Baroda FD' },
  { code: 'PNB_FD', name: 'Punjab National Bank FD' },
  { code: 'IDFC_FD', name: 'IDFC FIRST Bank FD' },
  { code: 'INDUSIND_FD', name: 'IndusInd Bank FD' },
  { code: 'YES_FD', name: 'Yes Bank FD' },
];

const searchFd = async (query: string): Promise<InvestmentInstrumentSearchResult[]> => {
  const normalized = query.toLowerCase().trim();
  return fdInstruments
    .filter((fd) => {
      return fd.code.toLowerCase().includes(normalized) || fd.name.toLowerCase().includes(normalized);
    })
    .slice(0, 20)
    .map((fd) => ({
      code: fd.code,
      name: fd.name,
      kind: 'fd',
      source: 'internal',
    }));
};

const resolveStockInstrumentNames = async (codes: string[]): Promise<Map<string, string>> => {
  const names = new Map<string, string>();
  const requests = codes
    .map((code) => {
      const normalizedCode = code.trim();
      const symbol = normalizedCode.includes('.')
        ? normalizedCode.toUpperCase()
        : `${normalizedCode.toUpperCase()}.NS`;
      return {
        code: normalizedCode,
        symbol,
      };
    })
    .filter((item) => item.code !== '');

  const uniqueSymbols = [...new Set(requests.map((item) => item.symbol))];
  const nameBySymbol = new Map<string, string>();

  await Promise.all(
    splitIntoChunks(uniqueSymbols, 40).map(async (symbolsBatch) => {
      const payload = await fetchJson<{
        quoteResponse?: {
          result?: Array<{
            symbol?: string;
            longName?: string;
            shortName?: string;
            displayName?: string;
          }>;
        };
      }>(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolsBatch.join(','))}`,
        {
          cache: 'no-store',
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
          },
        },
      );
      const quotes = payload?.quoteResponse?.result ?? [];
      for (const quote of quotes) {
        const symbol = quote.symbol?.toUpperCase();
        if (symbol === undefined || symbol === '') {
          continue;
        }
        const resolvedName = quote.longName ?? quote.shortName ?? quote.displayName;
        if (resolvedName === undefined || resolvedName.trim() === '') {
          continue;
        }
        nameBySymbol.set(symbol, resolvedName.trim());
      }
    }),
  );

  for (const request of requests) {
    const resolvedName = nameBySymbol.get(request.symbol);
    if (resolvedName !== undefined) {
      names.set(request.code, resolvedName);
    }
  }

  return names;
};

const resolveMutualFundInstrumentNames = async (codes: string[]): Promise<Map<string, string>> => {
  const names = new Map<string, string>();
  const schemes = await getMutualFundSchemes();
  const schemeByCode = new Map<string, string>();
  for (const scheme of schemes) {
    schemeByCode.set(String(scheme.schemeCode), scheme.schemeName);
  }

  for (const code of codes) {
    const normalizedCode = code.trim();
    if (normalizedCode === '') {
      continue;
    }
    const resolvedName = schemeByCode.get(normalizedCode);
    if (resolvedName !== undefined && resolvedName.trim() !== '') {
      names.set(normalizedCode, resolvedName.trim());
    }
  }

  return names;
};

const resolveCryptoInstrumentNames = async (codes: string[]): Promise<Map<string, string>> => {
  const names = new Map<string, string>();
  const normalizedCodes = [...new Set(codes.map((code) => code.trim().toLowerCase()).filter(Boolean))];
  const nameById = new Map<string, string>();

  await Promise.all(
    splitIntoChunks(normalizedCodes, 100).map(async (idsBatch) => {
      const payload = await fetchJson<
        Array<{
          id?: string;
          name?: string;
          symbol?: string;
        }>
      >(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&ids=${encodeURIComponent(idsBatch.join(','))}&per_page=250&page=1&sparkline=false`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        },
      );
      const coins = payload ?? [];
      for (const coin of coins) {
        const id = coin.id?.trim().toLowerCase();
        if (id === undefined || id === '') {
          continue;
        }
        const baseName = coin.name?.trim();
        if (baseName === undefined || baseName === '') {
          continue;
        }
        const symbolSuffix = coin.symbol === undefined ? '' : ` (${coin.symbol.toUpperCase()})`;
        nameById.set(id, `${baseName}${symbolSuffix}`);
      }
    }),
  );

  for (const code of codes) {
    const normalizedCode = code.trim();
    if (normalizedCode === '') {
      continue;
    }
    const resolvedName = nameById.get(normalizedCode.toLowerCase());
    if (resolvedName !== undefined) {
      names.set(normalizedCode, resolvedName);
    }
  }

  return names;
};

const resolveInstrumentNames = async (
  instruments: Array<{ kind: InvestmentKindValue; code: string }>,
): Promise<Map<string, string>> => {
  const codesByKind: Record<InvestmentKindValue, string[]> = {
    fd: [],
    stocks: [],
    mutual_funds: [],
    crypto: [],
    other: [],
  };

  for (const instrument of instruments) {
    const normalizedCode = instrument.code.trim();
    if (normalizedCode === '') {
      continue;
    }
    codesByKind[instrument.kind].push(normalizedCode);
  }

  const [stockNames, mutualFundNames, cryptoNames] = await Promise.all([
    resolveStockInstrumentNames([...new Set(codesByKind.stocks)]),
    resolveMutualFundInstrumentNames([...new Set(codesByKind.mutual_funds)]),
    resolveCryptoInstrumentNames([...new Set(codesByKind.crypto)]),
  ]);

  const fdNameByCode = new Map(fdInstruments.map((instrument) => [instrument.code, instrument.name]));
  const resolved = new Map<string, string>();

  for (const instrument of instruments) {
    const normalizedCode = instrument.code.trim();
    if (normalizedCode === '') {
      continue;
    }

    let name: string | undefined;
    if (instrument.kind === 'stocks') {
      name = stockNames.get(normalizedCode);
    } else if (instrument.kind === 'mutual_funds') {
      name = mutualFundNames.get(normalizedCode);
    } else if (instrument.kind === 'crypto') {
      name = cryptoNames.get(normalizedCode);
    } else if (instrument.kind === 'fd') {
      name = fdNameByCode.get(normalizedCode);
    } else {
      name = normalizedCode;
    }

    resolved.set(createInstrumentKey(instrument.kind, normalizedCode), name ?? normalizedCode);
  }

  return resolved;
};

export const searchInvestmentInstruments = instrumentedFunction(
  'searchInvestmentInstruments',
  async (
    kind: InvestmentKindValue,
    query: string,
  ): Promise<InvestmentInstrumentSearchResult[]> => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  if (kind === 'stocks') {
    return searchStocks(normalizedQuery);
  }
  if (kind === 'mutual_funds') {
    return searchMutualFunds(normalizedQuery);
  }
  if (kind === 'crypto') {
    return searchCrypto(normalizedQuery);
  }
  if (kind === 'fd') {
    return searchFd(normalizedQuery);
  }
  return [];
  },
);

const dateToDayKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getHistoricalStockPrices = async ({
  code,
  startDate,
  endDate,
}: {
  code: string;
  startDate: Date;
  endDate: Date;
}): Promise<Array<{ date: Date; price: number }>> => {
  const symbol = code.includes('.') ? code.toUpperCase() : `${code.toUpperCase()}.NS`;
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
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${periodStart}&period2=${periodEnd}`,
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
};

const getHistoricalMutualFundPrices = async ({
  code,
  startDate,
  endDate,
}: {
  code: string;
  startDate: Date;
  endDate: Date;
}): Promise<Array<{ date: Date; price: number }>> => {
  const payload = await fetchJson<{
    data?: Array<{ date: string; nav: string }>;
  }>(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, {
    cache: 'no-store',
  });

  const values = payload?.data ?? [];
  return values
    .map((value) => {
      const parsedDate = parseMfDate(value.date);
      const nav = parseFloatSafe(value.nav);
      if (parsedDate === null || !Number.isFinite(nav) || nav <= 0) {
        return null;
      }
      return {
        date: parsedDate,
        price: nav,
      };
    })
    .filter((value): value is { date: Date; price: number } => value !== null)
    .reverse()
    .filter((value) => {
      return (
        value.date.getTime() >= startOfDay(startDate).getTime() &&
        value.date.getTime() <= startOfDay(endDate).getTime()
      );
    });
};

const getHistoricalCryptoPrices = async ({
  code,
  startDate,
  endDate,
}: {
  code: string;
  startDate: Date;
  endDate: Date;
}): Promise<Array<{ date: Date; price: number }>> => {
  const periodStart = Math.floor(startOfDay(startDate).getTime() / 1000);
  const periodEnd = Math.floor((startOfDay(endDate).getTime() + DAY_IN_MS) / 1000);
  const payload = await fetchJson<{ prices?: Array<[number, number]> }>(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(code.toLowerCase())}/market_chart/range?vs_currency=inr&from=${periodStart}&to=${periodEnd}`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    },
  );
  const values = payload?.prices ?? [];
  return values
    .map((value) => ({
      date: new Date(value[0]),
      price: value[1],
    }))
    .filter((value) => Number.isFinite(value.price) && value.price > 0);
};

const getHistoricalUnitPrices = async (
  kind: InvestmentKindValue,
  code: string,
  startDate: Date,
  endDate: Date,
): Promise<Array<{ date: Date; price: number }>> => {
  if (kind === 'stocks') {
    return getHistoricalStockPrices({ code, startDate, endDate });
  }
  if (kind === 'mutual_funds') {
    return getHistoricalMutualFundPrices({ code, startDate, endDate });
  }
  if (kind === 'crypto') {
    return getHistoricalCryptoPrices({ code, startDate, endDate });
  }
  return [];
};

const getStockQuotes = async (requests: QuoteRequest[]): Promise<Map<string, Quote>> => {
  const map = new Map<string, Quote>();

  await Promise.all(
    requests.map(async ({ investmentId, code }) => {
      const symbol = code.includes('.') ? code.toUpperCase() : `${code.toUpperCase()}.NS`;
      const payload = await fetchJson<{
        chart?: {
          result?: Array<{
            meta?: { regularMarketPrice?: number; regularMarketTime?: number; currency?: string };
          }>;
        };
      }>(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        {
          cache: 'no-store',
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
          },
        },
      );
      const meta = payload?.chart?.result?.[0]?.meta;
      if (meta?.currency !== 'INR') {
        return;
      }
      if (meta.regularMarketPrice === undefined) {
        return;
      }
      map.set(investmentId, {
        unitPriceInr: meta.regularMarketPrice,
        asOf:
          meta.regularMarketTime === undefined ? null : new Date(meta.regularMarketTime * 1000),
        source: 'yahoo-finance',
      });
    }),
  );

  return map;
};

const getMutualFundQuotes = async (requests: QuoteRequest[]): Promise<Map<string, Quote>> => {
  const map = new Map<string, Quote>();

  await Promise.all(
    requests.map(async ({ investmentId, code }) => {
      const payload = await fetchJson<{
        data?: Array<{ date: string; nav: string }>;
      }>(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, {
        cache: 'no-store',
      });
      const nav = payload?.data?.[0];
      if (nav === undefined) {
        return;
      }
      const price = parseFloatSafe(nav.nav);
      if (!Number.isFinite(price) || price <= 0) {
        return;
      }
      map.set(investmentId, {
        unitPriceInr: price,
        asOf: parseMfDate(nav.date),
        source: 'mfapi.in',
      });
    }),
  );

  return map;
};

const getCryptoQuotes = async (requests: QuoteRequest[]): Promise<Map<string, Quote>> => {
  const map = new Map<string, Quote>();
  const cryptoIds = [...new Set(requests.map((request) => request.code.toLowerCase().trim()))];
  if (cryptoIds.length === 0) {
    return map;
  }

  const payload = await fetchJson<
    Record<string, { inr?: number; last_updated_at?: number } | undefined>
  >(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cryptoIds.join(','))}&vs_currencies=inr&include_last_updated_at=true`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (payload === null) {
    return map;
  }

  for (const request of requests) {
    const quote = payload[request.code.toLowerCase().trim()];
    if (quote?.inr === undefined) {
      continue;
    }
    map.set(request.investmentId, {
      unitPriceInr: quote.inr,
      asOf: quote.last_updated_at === undefined ? null : new Date(quote.last_updated_at * 1000),
      source: 'coingecko',
    });
  }

  return map;
};

const getLiveQuotes = async (investmentsList: InvestmentRow[]): Promise<Map<string, Quote>> => {
  const openPositions = investmentsList.filter((investment) => {
    const kind = normalizeInvestmentKind(investment.investmentKind);
    return !investment.isClosed && isLivePriceInvestment(kind) && Boolean(investment.instrumentCode);
  });

  const requestsByKind: Record<'stocks' | 'mutual_funds' | 'crypto', QuoteRequest[]> = {
    stocks: [],
    mutual_funds: [],
    crypto: [],
  };

  for (const investment of openPositions) {
    const kind = normalizeInvestmentKind(investment.investmentKind);
    const request = {
      investmentId: investment.id,
      code: investment.instrumentCode?.trim() ?? '',
    };
    if (request.code === '') {
      continue;
    }
    if (kind === 'stocks' || kind === 'mutual_funds' || kind === 'crypto') {
      requestsByKind[kind].push(request);
    }
  }

  const [stocks, mfs, crypto] = await Promise.all([
    getStockQuotes(requestsByKind.stocks),
    getMutualFundQuotes(requestsByKind.mutual_funds),
    getCryptoQuotes(requestsByKind.crypto),
  ]);

  return new Map<string, Quote>([...stocks, ...mfs, ...crypto]);
};

export const enrichInvestments = instrumentedFunction(
  'enrichInvestments',
  async (investmentsList: InvestmentRow[]): Promise<EnrichedInvestment[]> => {
  const quotes = await getLiveQuotes(investmentsList);
  const instrumentNames = await resolveInstrumentNames(
    investmentsList.map((investment) => ({
      kind: normalizeInvestmentKind(investment.investmentKind),
      code: investment.instrumentCode?.trim() ?? '',
    })),
  );

  return investmentsList.map((investment) => {
    const normalizedKind = normalizeInvestmentKind(investment.investmentKind);
    const instrumentCode = investment.instrumentCode?.trim() ?? '';
    const instrumentName =
      instrumentCode === ''
        ? null
        : (instrumentNames.get(createInstrumentKey(normalizedKind, instrumentCode)) ?? instrumentCode);
    const investedAmount = parseOptionalNumber(investment.investmentAmount) ?? 0;
    const units = parseOptionalNumber(investment.units);
    const quote = quotes.get(investment.id);
    const closedAmount = parseOptionalNumber(investment.amount);

    const valuationAmount = (() => {
      if (investment.isClosed) {
        return closedAmount;
      }
      if (quote !== undefined && units !== null) {
        return quote.unitPriceInr * units;
      }
      if (normalizedKind === 'fd') {
        return getFdValuation(investment);
      }
      return closedAmount;
    })();

    const pnl = valuationAmount === null ? null : valuationAmount - investedAmount;
    const pnlPercentage =
      pnl === null || investedAmount === 0 ? null : (pnl / Math.abs(investedAmount)) * 100;

    return {
      ...investment,
      normalizedKind,
      instrumentName,
      isClosedPosition: investment.isClosed,
      liveUnitPrice: investment.isClosed ? null : quote?.unitPriceInr ?? null,
      valuationAmount,
      pnl,
      pnlPercentage,
      valuationSource: investment.isClosed ? 'closed' : quote?.source ?? null,
      valuationDate: investment.isClosed ? investment.closedAt : quote?.asOf ?? null,
    };
  });
  },
);

const getUnitsForInvestment = (investment: EnrichedInvestment): number => {
  const directUnits = parseOptionalNumber(investment.units);
  if (directUnits !== null && directUnits > 0) {
    return directUnits;
  }
  const purchaseRate = parseOptionalNumber(investment.purchaseRate);
  const investedAmount = parseOptionalNumber(investment.investmentAmount);
  if (purchaseRate !== null && purchaseRate > 0 && investedAmount !== null && investedAmount > 0) {
    return investedAmount / purchaseRate;
  }
  return 0;
};

const getFallbackUnitPrice = (investment: EnrichedInvestment): number | undefined => {
  const purchaseRate = parseOptionalNumber(investment.purchaseRate);
  if (purchaseRate !== null && purchaseRate > 0) {
    return purchaseRate;
  }
  const units = getUnitsForInvestment(investment);
  const investedAmount = parseOptionalNumber(investment.investmentAmount);
  if (units > 0 && investedAmount !== null && investedAmount > 0) {
    return investedAmount / units;
  }
  return undefined;
};

const getDailyRangeFromInvestments = ({
  investmentsList,
  start,
  end,
}: {
  investmentsList: EnrichedInvestment[];
  start?: Date;
  end?: Date;
}): { startDate: Date; endDate: Date; days: Date[] } => {
  const now = startOfDay(new Date());
  const earliestInvestmentDate = investmentsList.reduce<Date>(
    (earliest, investment) => {
      const investmentDate = startOfDay(investment.investmentDate);
      return investmentDate.getTime() < earliest.getTime() ? investmentDate : earliest;
    },
    now,
  );
  const requestedStart = start === undefined ? earliestInvestmentDate : startOfDay(start);
  const requestedEnd = end === undefined ? now : startOfDay(end);
  const clampedEnd = requestedEnd.getTime() > now.getTime() ? now : requestedEnd;
  const clampedStart = clampDateInRange(requestedStart, earliestInvestmentDate, clampedEnd);
  return {
    startDate: clampedStart,
    endDate: clampedEnd,
    days: buildDailyRange(clampedStart, clampedEnd),
  };
};

const buildDailyInstrumentTimeline = async ({
  kind,
  code,
  positions,
  startDate,
  endDate,
}: {
  kind: InvestmentKindValue;
  code: string;
  positions: EnrichedInvestment[];
  startDate: Date;
  endDate: Date;
}): Promise<InstrumentHoldingTimelinePoint[]> => {
  const dailyDates = buildDailyRange(startDate, endDate);
  if (dailyDates.length === 0) {
    return [];
  }

  if (!isUnitBasedInvestment(kind)) {
    return dailyDates.map((day) => {
      let value = 0;
      for (const position of positions) {
        const investmentDay = startOfDay(position.investmentDate);
        const closedDay = position.closedAt === null ? null : startOfDay(position.closedAt);
        if (day.getTime() < investmentDay.getTime()) {
          continue;
        }
        if (closedDay !== null && day.getTime() > closedDay.getTime()) {
          continue;
        }
        if (kind === 'fd') {
          value += getFdValuationAtDate(position, day) ?? 0;
        } else {
          value += parseOptionalNumber(position.amount) ?? parseOptionalNumber(position.investmentAmount) ?? 0;
        }
      }
      return {
        date: day,
        unitPrice: value,
        unitsHeld: value > 0 ? 1 : 0,
        holdingValue: value,
      };
    });
  }

  const fallbackPrice = positions
    .map((position) => getFallbackUnitPrice(position))
    .find((value): value is number => value !== undefined && value > 0);

  const rawPrices = await getHistoricalUnitPrices(kind, code, startDate, endDate);
  const dailyPrices = buildDailyPriceSeries({
    rawPoints: rawPrices,
    startDate,
    endDate,
    fallbackPrice,
  });

  const unitEvents = new Map<string, number>();
  let unitsHeld = 0;
  for (const position of positions) {
    const positionUnits = getUnitsForInvestment(position);
    if (positionUnits <= 0) {
      continue;
    }
    const investmentDay = startOfDay(position.investmentDate);
    const closedDay = position.closedAt === null ? null : startOfDay(position.closedAt);
    if (investmentDay.getTime() < startDate.getTime()) {
      unitsHeld += positionUnits;
    } else {
      const key = dateToDayKey(investmentDay);
      unitEvents.set(key, (unitEvents.get(key) ?? 0) + positionUnits);
    }
    if (closedDay !== null) {
      if (closedDay.getTime() < startDate.getTime()) {
        unitsHeld -= positionUnits;
      } else {
        const key = dateToDayKey(closedDay);
        unitEvents.set(key, (unitEvents.get(key) ?? 0) - positionUnits);
      }
    }
  }

  if (unitsHeld < 0) {
    unitsHeld = 0;
  }

  return dailyPrices.map((pricePoint) => {
    const dayKey = dateToDayKey(pricePoint.date);
    unitsHeld += unitEvents.get(dayKey) ?? 0;
    if (unitsHeld < 0) {
      unitsHeld = 0;
    }
    return {
      date: pricePoint.date,
      unitPrice: pricePoint.price,
      unitsHeld,
      holdingValue: pricePoint.price * unitsHeld,
    };
  });
};

export const getInvestmentsDashboard = instrumentedFunction(
  'getInvestmentsDashboard',
  async ({
    investmentsList,
    start,
    end,
  }: {
    investmentsList: EnrichedInvestment[];
    start?: Date;
    end?: Date;
  }): Promise<InvestmentsDashboard> => {
  const kindMap = new Map<
    InvestmentKindValue,
    {
      investedAmount: number;
      valuationAmount: number;
      openPositions: number;
      closedPositions: number;
      totalPositions: number;
    }
  >();
  const instrumentMap = new Map<string, DashboardInstrumentOption>();
  let totalInvestedAmount = 0;
  let totalValuationAmount = 0;
  let openPositions = 0;
  let closedPositions = 0;

  for (const investment of investmentsList) {
    const investedAmount = parseOptionalNumber(investment.investmentAmount) ?? 0;
    const valuationAmount = investment.valuationAmount ?? investedAmount;
    totalInvestedAmount += investedAmount;
    totalValuationAmount += valuationAmount;

    if (investment.isClosedPosition) {
      closedPositions += 1;
    } else {
      openPositions += 1;
    }

    const kindSummary = kindMap.get(investment.normalizedKind) ?? {
      investedAmount: 0,
      valuationAmount: 0,
      openPositions: 0,
      closedPositions: 0,
      totalPositions: 0,
    };
    kindSummary.investedAmount += investedAmount;
    kindSummary.valuationAmount += valuationAmount;
    kindSummary.totalPositions += 1;
    if (investment.isClosedPosition) {
      kindSummary.closedPositions += 1;
    } else {
      kindSummary.openPositions += 1;
    }
    kindMap.set(investment.normalizedKind, kindSummary);

    const code = investment.instrumentCode?.trim() ?? '';
    if (code !== '') {
      const instrumentKey = `${investment.normalizedKind}:${code}`;
      const instrumentSummary = instrumentMap.get(instrumentKey) ?? {
        kind: investment.normalizedKind,
        code,
        name: investment.instrumentName ?? code,
        positionsCount: 0,
        units: 0,
        investedAmount: 0,
        valuationAmount: 0,
        pnl: 0,
      };
      instrumentSummary.positionsCount += 1;
      instrumentSummary.units += getUnitsForInvestment(investment);
      instrumentSummary.investedAmount += investedAmount;
      instrumentSummary.valuationAmount += valuationAmount;
      instrumentSummary.pnl = instrumentSummary.valuationAmount - instrumentSummary.investedAmount;
      instrumentMap.set(instrumentKey, instrumentSummary);
    }
  }

  const kindBreakdown = [...kindMap.entries()]
    .map(([kind, summary]) => ({
      kind,
      investedAmount: summary.investedAmount,
      valuationAmount: summary.valuationAmount,
      pnl: summary.valuationAmount - summary.investedAmount,
      openPositions: summary.openPositions,
      closedPositions: summary.closedPositions,
      totalPositions: summary.totalPositions,
    }))
    .sort((left, right) => right.valuationAmount - left.valuationAmount);

  const instrumentOptions = [...instrumentMap.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  const { startDate, endDate, days } = getDailyRangeFromInvestments({
    investmentsList,
    start,
    end,
  });

  const dailyValuation = new Map<string, number>();
  const investedEvents = new Map<string, number>();
  let baseInvestedAmount = 0;

  const unitBasedGroups = new Map<
    string,
    { kind: InvestmentKindValue; code: string; positions: EnrichedInvestment[] }
  >();
  const nonUnitPositions: EnrichedInvestment[] = [];

  for (const investment of investmentsList) {
    const investedAmount = parseOptionalNumber(investment.investmentAmount) ?? 0;
    const investmentDay = startOfDay(investment.investmentDate);
    const closeDay = investment.closedAt === null ? null : startOfDay(investment.closedAt);

    if (investmentDay.getTime() < startDate.getTime()) {
      baseInvestedAmount += investedAmount;
    } else {
      const key = dateToDayKey(investmentDay);
      investedEvents.set(key, (investedEvents.get(key) ?? 0) + investedAmount);
    }
    if (closeDay !== null) {
      if (closeDay.getTime() < startDate.getTime()) {
        baseInvestedAmount -= investedAmount;
      } else if (closeDay.getTime() <= endDate.getTime()) {
        const key = dateToDayKey(closeDay);
        investedEvents.set(key, (investedEvents.get(key) ?? 0) - investedAmount);
      }
    }

    const code = investment.instrumentCode?.trim() ?? '';
    if (isUnitBasedInvestment(investment.normalizedKind) && code !== '') {
      const groupKey = `${investment.normalizedKind}:${code}`;
      const group = unitBasedGroups.get(groupKey) ?? {
        kind: investment.normalizedKind,
        code,
        positions: [],
      };
      group.positions.push(investment);
      unitBasedGroups.set(groupKey, group);
    } else {
      nonUnitPositions.push(investment);
    }
  }

  await Promise.all(
    [...unitBasedGroups.values()].map(async (group) => {
      const dailyInstrumentTimeline = await buildDailyInstrumentTimeline({
        kind: group.kind,
        code: group.code,
        positions: group.positions,
        startDate,
        endDate,
      });
      for (const point of dailyInstrumentTimeline) {
        const key = dateToDayKey(point.date);
        dailyValuation.set(key, (dailyValuation.get(key) ?? 0) + point.holdingValue);
      }
    }),
  );

  for (const investment of nonUnitPositions) {
    const investmentDay = startOfDay(investment.investmentDate);
    const closeDay = investment.closedAt === null ? null : startOfDay(investment.closedAt);

    for (const day of days) {
      if (day.getTime() < investmentDay.getTime()) {
        continue;
      }
      if (closeDay !== null && day.getTime() > closeDay.getTime()) {
        continue;
      }
      const value =
        investment.normalizedKind === 'fd'
          ? getFdValuationAtDate(investment, day) ?? 0
          : parseOptionalNumber(investment.amount) ??
            parseOptionalNumber(investment.investmentAmount) ??
            0;
      const dayKey = dateToDayKey(day);
      dailyValuation.set(dayKey, (dailyValuation.get(dayKey) ?? 0) + value);
    }
  }

  let runningInvestedAmount = baseInvestedAmount;
  if (runningInvestedAmount < 0) {
    runningInvestedAmount = 0;
  }

  const timeline = days.map((day) => {
    const dayKey = dateToDayKey(day);
    runningInvestedAmount += investedEvents.get(dayKey) ?? 0;
    if (runningInvestedAmount < 0) {
      runningInvestedAmount = 0;
    }
    const valuationAmount = dailyValuation.get(dayKey) ?? 0;
    return {
      date: day,
      investedAmount: runningInvestedAmount,
      valuationAmount,
      pnl: valuationAmount - runningInvestedAmount,
    };
  });

  return {
    summary: {
      investedAmount: totalInvestedAmount,
      valuationAmount: totalValuationAmount,
      pnl: totalValuationAmount - totalInvestedAmount,
      openPositions,
      closedPositions,
      totalPositions: openPositions + closedPositions,
    },
    kindBreakdown,
    timeline,
    instrumentOptions,
  };
  },
);

export const getInstrumentHoldingTimeline = instrumentedFunction(
  'getInstrumentHoldingTimeline',
  async ({
    kind,
    code,
    investmentsList,
  }: {
    kind: InvestmentKindValue;
    code: string;
    investmentsList: EnrichedInvestment[];
  }): Promise<InstrumentHoldingTimeline> => {
  if (investmentsList.length === 0) {
    return {
      points: [],
      summary: {
        unitsHeld: 0,
        investedAmount: 0,
        latestHoldingValue: 0,
        pnl: 0,
      },
    };
  }

  const { startDate, endDate } = getDailyRangeFromInvestments({
    investmentsList,
  });
  const points = await buildDailyInstrumentTimeline({
    kind,
    code,
    positions: investmentsList,
    startDate,
    endDate,
  });

  const investedAmount = investmentsList.reduce((acc, investment) => {
    return acc + (parseOptionalNumber(investment.investmentAmount) ?? 0);
  }, 0);
  const latestPoint = points.at(-1);
  const latestHoldingValue = latestPoint?.holdingValue ?? 0;

  return {
    points,
    summary: {
      unitsHeld: latestPoint?.unitsHeld ?? 0,
      investedAmount,
      latestHoldingValue,
      pnl: latestHoldingValue - investedAmount,
    },
  };
  },
);
