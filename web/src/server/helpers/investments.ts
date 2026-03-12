import type { investments } from '@/db/schema';
import { env } from '@/lib/env';
import { instrumentedFunction } from '@/lib/instrumentation';
import {
  type InvestmentKindValue,
  type InvestmentTimelineRangeValue,
  investmentTimelineRangeDays,
  isLivePriceInvestment,
  isUnitBasedInvestment,
  normalizeInvestmentKind,
} from '@/lib/investments';
import { parseFloatSafe } from '@/server/helpers/emi-calculations';

const YEAR_IN_MS = 365.25 * 24 * 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; ExpenseTracker/1.0)';

const getCoinGeckoHeaders = (): HeadersInit => ({
  Accept: 'application/json',
  'x-cg-demo-api-key': env.COINGECKO_API_KEY,
});

type InvestmentRow = typeof investments.$inferSelect;

type Quote = {
  unitPriceInr: number;
  asOf: Date | null;
  source: string;
};

type InstrumentIdentity = {
  kind: InvestmentKindValue;
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
  dayChange: number;
  dayChangePercentage: number | null;
};

export type DashboardInstrumentBreakdown = DashboardInstrumentOption & {
  openPositions: number;
  closedPositions: number;
  totalPositions: number;
  averageBuyPrice: number | null;
  currentUnitPrice: number | null;
  pnlPercentage: number | null;
};

export type InvestmentsDashboard = {
  summary: {
    investedAmount: number;
    valuationAmount: number;
    pnl: number;
    pnlPercentage: number | null;
    dayChange: number;
    dayChangePercentage: number | null;
    openPositions: number;
    closedPositions: number;
    totalPositions: number;
  };
  kindBreakdown: Array<{
    kind: InvestmentKindValue;
    investedAmount: number;
    valuationAmount: number;
    pnl: number;
    pnlPercentage: number | null;
    dayChange: number;
    dayChangePercentage: number | null;
    openPositions: number;
    closedPositions: number;
    totalPositions: number;
  }>;
  timeline: InvestmentTimelinePoint[];
  instrumentOptions: DashboardInstrumentOption[];
  instrumentBreakdown: DashboardInstrumentBreakdown[];
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

export type InstrumentTimelineEntry = {
  kind: InvestmentKindValue;
  code: string;
  timeline: InstrumentHoldingTimeline;
};

type InvestmentMarketDataContext = {
  quoteByInstrumentKey: Map<string, Quote>;
  nameByInstrumentKey: Map<string, string>;
  historyByInstrumentKey: Map<string, Array<{ date: Date; price: number }>>;
};

export type InvestmentsPageData = {
  table: {
    investments: EnrichedInvestment[];
    pageCount: number;
    rowsCount: number;
  };
  dashboard: InvestmentsDashboard;
  instrumentTimelines: InstrumentTimelineEntry[];
  defaultRange: {
    range: '1m';
    startDate: Date;
    endDate: Date;
  };
};

export type InvestmentsRangeTimelines = {
  range: InvestmentTimelineRangeValue;
  startDate: Date;
  endDate: Date;
  timeline: InvestmentTimelinePoint[];
  instrumentTimelines: InstrumentTimelineEntry[];
};

export type EnrichedInvestment = InvestmentRow & {
  normalizedKind: InvestmentKindValue;
  instrumentName: string | null;
  isClosedPosition: boolean;
  liveUnitPrice: number | null;
  valuationAmount: number | null;
  pnl: number | null;
  pnlPercentage: number | null;
  dayChange: number | null;
  dayChangePercentage: number | null;
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

const getPercentageChange = (numerator: number, denominator: number): number | null => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return (numerator / Math.abs(denominator)) * 100;
};

const getDayChangePercentageFromValuation = (
  valuationAmount: number,
  dayChange: number,
): number | null => {
  return getPercentageChange(dayChange, valuationAmount - dayChange);
};

const deriveUnits = ({ units }: { units: string | null | undefined }): number | null => {
  const parsedUnits = parseOptionalNumber(units);
  if (parsedUnits !== null && parsedUnits > 0) {
    return parsedUnits;
  }

  return null;
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

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

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

const subtractDays = (date: Date, days: number): Date => {
  return new Date(startOfDay(date).getTime() - Math.max(days - 1, 0) * DAY_IN_MS);
};

const getTimeRangeBounds = (
  range: InvestmentTimelineRangeValue,
  earliestDate: Date,
  referenceEndDate?: Date,
): { startDate: Date; endDate: Date } => {
  const now = startOfDay(new Date());
  const requestedEnd = referenceEndDate === undefined ? now : startOfDay(referenceEndDate);
  const endDate = requestedEnd.getTime() > now.getTime() ? now : requestedEnd;
  const days = investmentTimelineRangeDays[range];
  if (days === undefined) {
    return {
      startDate: earliestDate,
      endDate,
    };
  }
  const requestedStart = subtractDays(endDate, days);
  return {
    startDate: requestedStart.getTime() < earliestDate.getTime() ? earliestDate : requestedStart,
    endDate,
  };
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

const fetchJson = instrumentedFunction(
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
    headers: getCoinGeckoHeaders(),
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
      return (
        fd.code.toLowerCase().includes(normalized) || fd.name.toLowerCase().includes(normalized)
      );
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
  const normalizedCodes = [
    ...new Set(codes.map((code) => code.trim().toLowerCase()).filter(Boolean)),
  ];
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
          headers: getCoinGeckoHeaders(),
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

  const fdNameByCode = new Map(
    fdInstruments.map((instrument) => [instrument.code, instrument.name]),
  );
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
  async (kind: InvestmentKindValue, query: string): Promise<InvestmentInstrumentSearchResult[]> => {
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
      headers: getCoinGeckoHeaders(),
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

const getStockQuotesByCode = async (codes: string[]): Promise<Map<string, Quote>> => {
  const quotesByCode = new Map<string, Quote>();
  const normalizedCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
  if (normalizedCodes.length === 0) {
    return quotesByCode;
  }

  await Promise.all(
    normalizedCodes.map(async (code) => {
      const symbol = code.includes('.') ? code.toUpperCase() : `${code.toUpperCase()}.NS`;
      const payload = await fetchJson<{
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              regularMarketTime?: number;
              currency?: string;
            };
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
      if (
        meta?.currency !== 'INR' ||
        meta.regularMarketPrice === undefined ||
        !Number.isFinite(meta.regularMarketPrice) ||
        meta.regularMarketPrice <= 0
      ) {
        return;
      }
      quotesByCode.set(code, {
        unitPriceInr: meta.regularMarketPrice,
        asOf: meta.regularMarketTime === undefined ? null : new Date(meta.regularMarketTime * 1000),
        source: 'yahoo-finance',
      });
    }),
  );

  return quotesByCode;
};

const getMutualFundQuotesByCode = async (codes: string[]): Promise<Map<string, Quote>> => {
  const quotesByCode = new Map<string, Quote>();
  const normalizedCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
  await Promise.all(
    normalizedCodes.map(async (code) => {
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
      quotesByCode.set(code, {
        unitPriceInr: price,
        asOf: parseMfDate(nav.date),
        source: 'mfapi.in',
      });
    }),
  );
  return quotesByCode;
};

const getCryptoQuotesByCode = async (codes: string[]): Promise<Map<string, Quote>> => {
  const quotesByCode = new Map<string, Quote>();
  const normalizedCodes = [
    ...new Set(codes.map((code) => code.trim().toLowerCase()).filter(Boolean)),
  ];
  if (normalizedCodes.length === 0) {
    return quotesByCode;
  }

  const payload = await fetchJson<
    Record<string, { inr?: number; last_updated_at?: number } | undefined>
  >(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(normalizedCodes.join(','))}&vs_currencies=inr&include_last_updated_at=true`,
    {
      cache: 'no-store',
      headers: getCoinGeckoHeaders(),
    },
  );

  if (payload === null) {
    return quotesByCode;
  }

  for (const code of normalizedCodes) {
    const quote = payload[code];
    if (quote?.inr === undefined || !Number.isFinite(quote.inr) || quote.inr <= 0) {
      continue;
    }
    quotesByCode.set(code, {
      unitPriceInr: quote.inr,
      asOf: quote.last_updated_at === undefined ? null : new Date(quote.last_updated_at * 1000),
      source: 'coingecko',
    });
  }

  return quotesByCode;
};

const getUniqueInstruments = (investmentsList: InvestmentRow[]): InstrumentIdentity[] => {
  const instrumentMap = new Map<string, InstrumentIdentity>();
  for (const investment of investmentsList) {
    const kind = normalizeInvestmentKind(investment.investmentKind);
    const code = investment.instrumentCode?.trim() ?? '';
    if (code === '') {
      continue;
    }
    instrumentMap.set(createInstrumentKey(kind, code), { kind, code });
  }
  return [...instrumentMap.values()];
};

const getLiveQuotesByInstrument = async (
  investmentsList: InvestmentRow[],
): Promise<Map<string, Quote>> => {
  const openLiveInstruments = getUniqueInstruments(
    investmentsList.filter((investment) => {
      const kind = normalizeInvestmentKind(investment.investmentKind);
      return !investment.isClosed && isLivePriceInvestment(kind);
    }),
  );
  const codesByKind: Record<'stocks' | 'mutual_funds' | 'crypto', string[]> = {
    stocks: [],
    mutual_funds: [],
    crypto: [],
  };
  for (const instrument of openLiveInstruments) {
    if (
      instrument.kind === 'stocks' ||
      instrument.kind === 'mutual_funds' ||
      instrument.kind === 'crypto'
    ) {
      codesByKind[instrument.kind].push(instrument.code);
    }
  }

  const [stockQuotes, mutualFundQuotes, cryptoQuotes] = await Promise.all([
    getStockQuotesByCode(codesByKind.stocks),
    getMutualFundQuotesByCode(codesByKind.mutual_funds),
    getCryptoQuotesByCode(codesByKind.crypto),
  ]);

  const quoteByInstrumentKey = new Map<string, Quote>();
  for (const instrument of openLiveInstruments) {
    if (instrument.kind === 'stocks') {
      const quote = stockQuotes.get(instrument.code);
      if (quote !== undefined) {
        quoteByInstrumentKey.set(createInstrumentKey(instrument.kind, instrument.code), quote);
      }
      continue;
    }
    if (instrument.kind === 'mutual_funds') {
      const quote = mutualFundQuotes.get(instrument.code);
      if (quote !== undefined) {
        quoteByInstrumentKey.set(createInstrumentKey(instrument.kind, instrument.code), quote);
      }
      continue;
    }
    if (instrument.kind === 'crypto') {
      const quote = cryptoQuotes.get(instrument.code.toLowerCase());
      if (quote !== undefined) {
        quoteByInstrumentKey.set(createInstrumentKey(instrument.kind, instrument.code), quote);
      }
    }
  }

  return quoteByInstrumentKey;
};

const prefetchHistoricalPrices = async ({
  instruments,
  startDate,
  endDate,
}: {
  instruments: InstrumentIdentity[];
  startDate: Date;
  endDate: Date;
}): Promise<Map<string, Array<{ date: Date; price: number }>>> => {
  const historyByInstrumentKey = new Map<string, Array<{ date: Date; price: number }>>();
  await Promise.all(
    instruments.map(async (instrument) => {
      if (!isUnitBasedInvestment(instrument.kind)) {
        return;
      }
      const history = await getHistoricalUnitPrices(
        instrument.kind,
        instrument.code,
        startDate,
        endDate,
      );
      historyByInstrumentKey.set(createInstrumentKey(instrument.kind, instrument.code), history);
    }),
  );
  return historyByInstrumentKey;
};

const buildInvestmentMarketDataContext = instrumentedFunction(
  'buildInvestmentMarketDataContext',
  async ({
    investmentsList,
    historyStartDate,
    historyEndDate,
  }: {
    investmentsList: InvestmentRow[];
    historyStartDate?: Date;
    historyEndDate?: Date;
  }): Promise<InvestmentMarketDataContext> => {
    const instruments = getUniqueInstruments(investmentsList);
    const [quoteByInstrumentKey, nameByInstrumentKey, historyByInstrumentKey] = await Promise.all([
      getLiveQuotesByInstrument(investmentsList),
      resolveInstrumentNames(instruments),
      historyStartDate === undefined || historyEndDate === undefined
        ? Promise.resolve(new Map<string, Array<{ date: Date; price: number }>>())
        : prefetchHistoricalPrices({
            instruments,
            startDate: historyStartDate,
            endDate: historyEndDate,
          }),
    ]);
    return {
      quoteByInstrumentKey,
      nameByInstrumentKey,
      historyByInstrumentKey,
    };
  },
);

type UnitInstrumentOneDayMetrics = {
  currentUnitPrice: number | null;
  previousUnitPrice: number | null;
};

const getLatestPricePointOnOrBeforeDate = (
  history: Array<{ date: Date; price: number }>,
  targetDate: Date,
): { date: Date; price: number } | null => {
  const targetTime = startOfDay(targetDate).getTime();
  let latestPoint: { date: Date; price: number } | null = null;
  let latestTime = Number.MIN_SAFE_INTEGER;

  for (const point of history) {
    const pointDayTime = startOfDay(point.date).getTime();
    if (pointDayTime > targetTime || point.price <= 0 || !Number.isFinite(point.price)) {
      continue;
    }
    if (pointDayTime >= latestTime) {
      latestTime = pointDayTime;
      latestPoint = point;
    }
  }

  return latestPoint;
};

const getLatestPricePointBeforeDate = (
  history: Array<{ date: Date; price: number }>,
  targetDate: Date,
): { date: Date; price: number } | null => {
  const targetTime = startOfDay(targetDate).getTime();
  let latestPoint: { date: Date; price: number } | null = null;
  let latestTime = Number.MIN_SAFE_INTEGER;

  for (const point of history) {
    const pointDayTime = startOfDay(point.date).getTime();
    if (pointDayTime >= targetTime || point.price <= 0 || !Number.isFinite(point.price)) {
      continue;
    }
    if (pointDayTime >= latestTime) {
      latestTime = pointDayTime;
      latestPoint = point;
    }
  }

  return latestPoint;
};

const getUnitInstrumentOneDayMetricsByKey = ({
  investmentsList,
  marketDataContext,
  asOfDate,
}: {
  investmentsList: InvestmentRow[];
  marketDataContext: InvestmentMarketDataContext;
  asOfDate: Date;
}): Map<string, UnitInstrumentOneDayMetrics> => {
  const metricsByInstrumentKey = new Map<string, UnitInstrumentOneDayMetrics>();

  for (const instrument of getUniqueInstruments(investmentsList)) {
    if (!isUnitBasedInvestment(instrument.kind)) {
      continue;
    }
    const key = createInstrumentKey(instrument.kind, instrument.code);
    const history = marketDataContext.historyByInstrumentKey.get(key) ?? [];
    const quote = marketDataContext.quoteByInstrumentKey.get(key);
    const quoteAsOfDate =
      quote?.asOf === null || quote?.asOf === undefined ? null : startOfDay(quote.asOf);
    const currentPointFromHistory = getLatestPricePointOnOrBeforeDate(
      history,
      quoteAsOfDate ?? asOfDate,
    );
    const currentReferenceDate =
      quoteAsOfDate ?? startOfDay(currentPointFromHistory?.date ?? asOfDate);
    const previousPointFromHistory = getLatestPricePointBeforeDate(history, currentReferenceDate);
    metricsByInstrumentKey.set(key, {
      currentUnitPrice: quote?.unitPriceInr ?? currentPointFromHistory?.price ?? null,
      previousUnitPrice: previousPointFromHistory?.price ?? null,
    });
  }

  return metricsByInstrumentKey;
};

const enrichInvestments = instrumentedFunction(
  'enrichInvestments',
  async ({
    investmentsList,
    marketDataContext,
    valuationDate,
  }: {
    investmentsList: InvestmentRow[];
    marketDataContext?: InvestmentMarketDataContext;
    valuationDate?: Date;
  }): Promise<EnrichedInvestment[]> => {
    const context =
      marketDataContext ??
      (await buildInvestmentMarketDataContext({
        investmentsList,
      }));
    const asOfDate =
      valuationDate === undefined ? startOfDay(new Date()) : startOfDay(valuationDate);
    const oneDayUnitMetricsByKey = getUnitInstrumentOneDayMetricsByKey({
      investmentsList,
      marketDataContext: context,
      asOfDate,
    });

    return investmentsList.map((investment) => {
      const normalizedKind = normalizeInvestmentKind(investment.investmentKind);
      const instrumentCode = investment.instrumentCode?.trim() ?? '';
      const instrumentKey = createInstrumentKey(normalizedKind, instrumentCode);
      const instrumentName =
        instrumentCode === ''
          ? null
          : (context.nameByInstrumentKey.get(instrumentKey) ?? instrumentCode);
      const investedAmount = parseOptionalNumber(investment.investmentAmount) ?? 0;
      const units = deriveUnits({
        units: investment.units,
      });
      const quote =
        instrumentCode === '' ? undefined : context.quoteByInstrumentKey.get(instrumentKey);
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
        return investedAmount;
      })();

      const pnl = valuationAmount === null ? null : valuationAmount - investedAmount;
      const pnlPercentage = pnl === null ? null : getPercentageChange(pnl, investedAmount);

      let dayChange: number | null = null;
      let dayChangePercentage: number | null = null;
      if (investment.isClosed) {
        dayChange = 0;
        dayChangePercentage = 0;
      } else if (normalizedKind === 'fd') {
        const currentValuation = getFdValuationAtDate(investment, asOfDate);
        const previousValuation = getFdValuationAtDate(
          investment,
          new Date(asOfDate.getTime() - DAY_IN_MS),
        );
        if (currentValuation !== null && previousValuation !== null) {
          dayChange = currentValuation - previousValuation;
          dayChangePercentage = getPercentageChange(dayChange, previousValuation);
        }
      } else if (isUnitBasedInvestment(normalizedKind) && instrumentCode !== '') {
        const units = deriveUnits({
          units: investment.units,
        });
        const metrics = oneDayUnitMetricsByKey.get(instrumentKey);
        const currentUnitPrice = metrics?.currentUnitPrice;
        const previousUnitPrice = metrics?.previousUnitPrice;
        if (
          units !== null &&
          units > 0 &&
          currentUnitPrice !== undefined &&
          currentUnitPrice !== null &&
          previousUnitPrice !== undefined &&
          previousUnitPrice !== null
        ) {
          const unitPriceDelta = currentUnitPrice - previousUnitPrice;
          dayChange = unitPriceDelta * units;
          dayChangePercentage = getPercentageChange(dayChange, units * previousUnitPrice);
        }
      }

      return {
        ...investment,
        normalizedKind,
        instrumentName,
        isClosedPosition: investment.isClosed,
        liveUnitPrice: investment.isClosed ? null : (quote?.unitPriceInr ?? null),
        valuationAmount,
        pnl,
        pnlPercentage,
        dayChange,
        dayChangePercentage,
        valuationSource: investment.isClosed ? 'closed' : (quote?.source ?? null),
        valuationDate: investment.isClosed ? investment.closedAt : (quote?.asOf ?? null),
      };
    });
  },
);

const getUnitsForInvestment = (investment: EnrichedInvestment): number => {
  return deriveUnits({ units: investment.units }) ?? 0;
};

const getFallbackUnitPrice = (investment: EnrichedInvestment): number | undefined => {
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
  const earliestInvestmentDate = investmentsList.reduce<Date>((earliest, investment) => {
    const investmentDate = startOfDay(investment.investmentDate);
    return investmentDate.getTime() < earliest.getTime() ? investmentDate : earliest;
  }, now);
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
  historyByInstrumentKey,
}: {
  kind: InvestmentKindValue;
  code: string;
  positions: EnrichedInvestment[];
  startDate: Date;
  endDate: Date;
  historyByInstrumentKey?: Map<string, Array<{ date: Date; price: number }>>;
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
          continue;
        }
        if (position.isClosedPosition) {
          value +=
            parseOptionalNumber(position.amount) ??
            parseOptionalNumber(position.investmentAmount) ??
            0;
          continue;
        }
        value += parseOptionalNumber(position.investmentAmount) ?? 0;
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

  const rawPrices =
    historyByInstrumentKey?.get(createInstrumentKey(kind, code)) ??
    (await getHistoricalUnitPrices(kind, code, startDate, endDate));
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

type InstrumentAggregate = {
  kind: InvestmentKindValue;
  code: string;
  name: string;
  positionsCount: number;
  openPositions: number;
  closedPositions: number;
  units: number;
  investedAmount: number;
  valuationAmount: number;
  dayChange: number;
  weightedBuyAmount: number;
  weightedBuyUnits: number;
  currentUnitPrice: number | null;
};

const buildInstrumentBreakdown = (
  investmentsList: EnrichedInvestment[],
): DashboardInstrumentBreakdown[] => {
  const aggregates = new Map<string, InstrumentAggregate>();

  for (const investment of investmentsList) {
    const code = investment.instrumentCode?.trim() ?? '';
    if (code === '') {
      continue;
    }
    const key = createInstrumentKey(investment.normalizedKind, code);
    const investedAmount = parseOptionalNumber(investment.investmentAmount) ?? 0;
    const valuationAmount = investment.valuationAmount ?? investedAmount;
    const dayChange = investment.dayChange ?? 0;
    const units = getUnitsForInvestment(investment);

    const aggregate = aggregates.get(key) ?? {
      kind: investment.normalizedKind,
      code,
      name: investment.instrumentName ?? code,
      positionsCount: 0,
      openPositions: 0,
      closedPositions: 0,
      units: 0,
      investedAmount: 0,
      valuationAmount: 0,
      dayChange: 0,
      weightedBuyAmount: 0,
      weightedBuyUnits: 0,
      currentUnitPrice: null,
    };

    aggregate.positionsCount += 1;
    if (investment.isClosedPosition) {
      aggregate.closedPositions += 1;
    } else {
      aggregate.openPositions += 1;
      aggregate.units += units;
    }
    aggregate.investedAmount += investedAmount;
    aggregate.valuationAmount += valuationAmount;
    aggregate.dayChange += dayChange;
    if (units > 0) {
      aggregate.weightedBuyAmount += investedAmount;
      aggregate.weightedBuyUnits += units;
    }
    if (!investment.isClosedPosition && investment.liveUnitPrice !== null) {
      aggregate.currentUnitPrice = investment.liveUnitPrice;
    }
    aggregates.set(key, aggregate);
  }

  return [...aggregates.values()]
    .map((aggregate) => {
      const pnl = aggregate.valuationAmount - aggregate.investedAmount;
      return {
        kind: aggregate.kind,
        code: aggregate.code,
        name: aggregate.name,
        positionsCount: aggregate.positionsCount,
        openPositions: aggregate.openPositions,
        closedPositions: aggregate.closedPositions,
        totalPositions: aggregate.positionsCount,
        units: aggregate.units,
        investedAmount: aggregate.investedAmount,
        valuationAmount: aggregate.valuationAmount,
        pnl,
        pnlPercentage: getPercentageChange(pnl, aggregate.investedAmount),
        dayChange: aggregate.dayChange,
        dayChangePercentage: getDayChangePercentageFromValuation(
          aggregate.valuationAmount,
          aggregate.dayChange,
        ),
        averageBuyPrice:
          aggregate.weightedBuyUnits > 0
            ? aggregate.weightedBuyAmount / aggregate.weightedBuyUnits
            : null,
        currentUnitPrice:
          aggregate.currentUnitPrice ??
          (aggregate.units > 0 ? aggregate.valuationAmount / aggregate.units : null),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

const getInvestmentsDashboard = instrumentedFunction(
  'getInvestmentsDashboard',
  async ({
    investmentsList,
    start,
    end,
    historyByInstrumentKey,
  }: {
    investmentsList: EnrichedInvestment[];
    start?: Date;
    end?: Date;
    historyByInstrumentKey?: Map<string, Array<{ date: Date; price: number }>>;
  }): Promise<InvestmentsDashboard> => {
    const kindMap = new Map<
      InvestmentKindValue,
      {
        investedAmount: number;
        valuationAmount: number;
        dayChange: number;
        openPositions: number;
        closedPositions: number;
        totalPositions: number;
      }
    >();
    const instrumentBreakdown = buildInstrumentBreakdown(investmentsList);
    const instrumentOptions: DashboardInstrumentOption[] = instrumentBreakdown.map((item) => ({
      kind: item.kind,
      code: item.code,
      name: item.name,
      positionsCount: item.positionsCount,
      units: item.units,
      investedAmount: item.investedAmount,
      valuationAmount: item.valuationAmount,
      pnl: item.pnl,
      dayChange: item.dayChange,
      dayChangePercentage: item.dayChangePercentage,
    }));
    let totalInvestedAmount = 0;
    let totalValuationAmount = 0;
    let totalDayChange = 0;
    let openPositions = 0;
    let closedPositions = 0;

    for (const investment of investmentsList) {
      const investedAmount = parseOptionalNumber(investment.investmentAmount) ?? 0;
      const valuationAmount = investment.valuationAmount ?? investedAmount;
      const dayChange = investment.dayChange ?? 0;
      totalInvestedAmount += investedAmount;
      totalValuationAmount += valuationAmount;
      totalDayChange += dayChange;

      if (investment.isClosedPosition) {
        closedPositions += 1;
      } else {
        openPositions += 1;
      }

      const kindSummary = kindMap.get(investment.normalizedKind) ?? {
        investedAmount: 0,
        valuationAmount: 0,
        dayChange: 0,
        openPositions: 0,
        closedPositions: 0,
        totalPositions: 0,
      };
      kindSummary.investedAmount += investedAmount;
      kindSummary.valuationAmount += valuationAmount;
      kindSummary.dayChange += dayChange;
      kindSummary.totalPositions += 1;
      if (investment.isClosedPosition) {
        kindSummary.closedPositions += 1;
      } else {
        kindSummary.openPositions += 1;
      }
      kindMap.set(investment.normalizedKind, kindSummary);
    }

    const kindBreakdown = [...kindMap.entries()]
      .map(([kind, summary]) => ({
        kind,
        investedAmount: summary.investedAmount,
        valuationAmount: summary.valuationAmount,
        pnl: summary.valuationAmount - summary.investedAmount,
        pnlPercentage: getPercentageChange(
          summary.valuationAmount - summary.investedAmount,
          summary.investedAmount,
        ),
        dayChange: summary.dayChange,
        dayChangePercentage: getDayChangePercentageFromValuation(
          summary.valuationAmount,
          summary.dayChange,
        ),
        openPositions: summary.openPositions,
        closedPositions: summary.closedPositions,
        totalPositions: summary.totalPositions,
      }))
      .sort((left, right) => right.valuationAmount - left.valuationAmount);

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
          historyByInstrumentKey,
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
        let value = parseOptionalNumber(investment.investmentAmount) ?? 0;
        if (investment.normalizedKind === 'fd') {
          value = getFdValuationAtDate(investment, day) ?? 0;
        } else if (investment.isClosedPosition) {
          value =
            parseOptionalNumber(investment.amount) ??
            parseOptionalNumber(investment.investmentAmount) ??
            0;
        }
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
        pnlPercentage: getPercentageChange(
          totalValuationAmount - totalInvestedAmount,
          totalInvestedAmount,
        ),
        dayChange: totalDayChange,
        dayChangePercentage: getDayChangePercentageFromValuation(
          totalValuationAmount,
          totalDayChange,
        ),
        openPositions,
        closedPositions,
        totalPositions: openPositions + closedPositions,
      },
      kindBreakdown,
      timeline,
      instrumentOptions,
      instrumentBreakdown,
    };
  },
);

const getInstrumentHoldingTimeline = instrumentedFunction(
  'getInstrumentHoldingTimeline',
  async ({
    kind,
    code,
    investmentsList,
    start,
    end,
    historyByInstrumentKey,
  }: {
    kind: InvestmentKindValue;
    code: string;
    investmentsList: EnrichedInvestment[];
    start?: Date;
    end?: Date;
    historyByInstrumentKey?: Map<string, Array<{ date: Date; price: number }>>;
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
      start,
      end,
    });
    const points = await buildDailyInstrumentTimeline({
      kind,
      code,
      positions: investmentsList,
      startDate,
      endDate,
      historyByInstrumentKey,
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

const buildInstrumentGroups = (investmentsList: EnrichedInvestment[]) => {
  const groups = new Map<
    string,
    { kind: InvestmentKindValue; code: string; positions: EnrichedInvestment[] }
  >();
  for (const investment of investmentsList) {
    const code = investment.instrumentCode?.trim() ?? '';
    if (code === '') {
      continue;
    }
    const key = createInstrumentKey(investment.normalizedKind, code);
    const group = groups.get(key) ?? {
      kind: investment.normalizedKind,
      code,
      positions: [],
    };
    group.positions.push(investment);
    groups.set(key, group);
  }
  return [...groups.values()];
};

const buildInstrumentTimelineEntries = instrumentedFunction(
  'buildInstrumentTimelineEntries',
  async ({
    investmentsList,
    startDate,
    endDate,
    historyByInstrumentKey,
  }: {
    investmentsList: EnrichedInvestment[];
    startDate: Date;
    endDate: Date;
    historyByInstrumentKey?: Map<string, Array<{ date: Date; price: number }>>;
  }): Promise<InstrumentTimelineEntry[]> => {
    const groups = buildInstrumentGroups(investmentsList);
    const entries = await Promise.all(
      groups.map(async (group) => ({
        kind: group.kind,
        code: group.code,
        timeline: await getInstrumentHoldingTimeline({
          kind: group.kind,
          code: group.code,
          investmentsList: group.positions,
          start: startDate,
          end: endDate,
          historyByInstrumentKey,
        }),
      })),
    );
    return entries.sort((left, right) => {
      const kindCompare = left.kind.localeCompare(right.kind);
      if (kindCompare !== 0) {
        return kindCompare;
      }
      return left.code.localeCompare(right.code);
    });
  },
);

export const buildInvestmentsPageData = instrumentedFunction(
  'buildInvestmentsPageData',
  async ({
    investmentsListRaw,
    page,
    perPage,
    endDate,
  }: {
    investmentsListRaw: InvestmentRow[];
    page: number;
    perPage: number;
    endDate?: Date;
  }): Promise<InvestmentsPageData> => {
    const now = startOfDay(new Date());
    const earliestDate = investmentsListRaw.reduce<Date>((earliest, investment) => {
      const investmentDate = startOfDay(investment.investmentDate);
      return investmentDate.getTime() < earliest.getTime() ? investmentDate : earliest;
    }, now);
    const defaultRange = getTimeRangeBounds('1m', earliestDate, endDate);
    const marketDataContext = await buildInvestmentMarketDataContext({
      investmentsList: investmentsListRaw,
      historyStartDate: defaultRange.startDate,
      historyEndDate: defaultRange.endDate,
    });
    const enrichedAll = await enrichInvestments({
      investmentsList: investmentsListRaw,
      marketDataContext,
      valuationDate: endDate,
    });

    const rowsCount = enrichedAll.length;
    const pageCount = Math.max(1, Math.ceil(rowsCount / perPage));
    const offset = Math.max(page - 1, 0) * perPage;
    const investments = enrichedAll.slice(offset, offset + perPage);
    const dashboard = await getInvestmentsDashboard({
      investmentsList: enrichedAll,
      start: defaultRange.startDate,
      end: defaultRange.endDate,
      historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
    });
    const instrumentTimelines = await buildInstrumentTimelineEntries({
      investmentsList: enrichedAll,
      startDate: defaultRange.startDate,
      endDate: defaultRange.endDate,
      historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
    });

    return {
      table: {
        investments,
        pageCount,
        rowsCount,
      },
      dashboard,
      instrumentTimelines,
      defaultRange: {
        range: '1m',
        startDate: defaultRange.startDate,
        endDate: defaultRange.endDate,
      },
    };
  },
);

export const buildInvestmentsRangeTimelines = instrumentedFunction(
  'buildInvestmentsRangeTimelines',
  async ({
    investmentsListRaw,
    range,
    endDate,
  }: {
    investmentsListRaw: InvestmentRow[];
    range: InvestmentTimelineRangeValue;
    endDate?: Date;
  }): Promise<InvestmentsRangeTimelines> => {
    const now = startOfDay(new Date());
    const earliestDate = investmentsListRaw.reduce<Date>((earliest, investment) => {
      const investmentDate = startOfDay(investment.investmentDate);
      return investmentDate.getTime() < earliest.getTime() ? investmentDate : earliest;
    }, now);
    const rangeBounds = getTimeRangeBounds(range, earliestDate, endDate);
    const marketDataContext = await buildInvestmentMarketDataContext({
      investmentsList: investmentsListRaw,
      historyStartDate: rangeBounds.startDate,
      historyEndDate: rangeBounds.endDate,
    });
    const enrichedAll = await enrichInvestments({
      investmentsList: investmentsListRaw,
      marketDataContext,
      valuationDate: endDate,
    });
    const dashboard = await getInvestmentsDashboard({
      investmentsList: enrichedAll,
      start: rangeBounds.startDate,
      end: rangeBounds.endDate,
      historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
    });
    const instrumentTimelines = await buildInstrumentTimelineEntries({
      investmentsList: enrichedAll,
      startDate: rangeBounds.startDate,
      endDate: rangeBounds.endDate,
      historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
    });
    return {
      range,
      startDate: rangeBounds.startDate,
      endDate: rangeBounds.endDate,
      timeline: dashboard.timeline,
      instrumentTimelines,
    };
  },
);
