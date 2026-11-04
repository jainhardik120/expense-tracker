import { instrumentedFunction } from '@/lib/instrumentation';

import type { PriceHistoryPoint, Quote } from '../types';

import {
  DAY_IN_MS,
  DEFAULT_USER_AGENT,
  fetchJson,
  fetchLiveJson,
  fetchText,
  parseNumericString,
  startOfDay,
} from '../shared';

type UpstoxGoldOverviewResponse = {
  success?: boolean;
  data?: {
    updatedDate?: string;
    price24k?: {
      today?: number;
      yesterday?: number;
    };
    valueOver10days?: Array<{
      date?: string;
      price24k?: number;
    }>;
  };
};

type UpstoxSilverOverviewResponse = {
  success?: boolean;
  data?: {
    updatedDate?: string;
    price?: {
      today?: number;
      yesterday?: number;
    };
    valueOver10days?: Array<{
      date?: string;
      price?: number;
    }>;
  };
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
      };
    }>;
  };
};

type GrowwGoldPage = {
  goldRateData?: {
    physicalGoldRate?: Record<
      string,
      {
        date?: string;
        price?: { TWENTY_FOUR?: number };
        percentageChange?: { TWENTY_FOUR?: number };
      }
    >;
  };
};

type GrowwSilverPage = {
  snapshotDate?: string;
  cityRates?: Array<{ slug?: string; todayPrice?: number; yesterdayPrice?: number }>;
  silverHistoricalRates?: Array<{ date?: string; pricePerGram?: number }>;
};

type PhysicalRate = { price: number; previous: number | null; date: Date | null };

type HindustanTimesGoldHistoryPoint = {
  date?: string;
  price24Cr?: string;
};

type HindustanTimesSilverHistoryPoint = {
  date?: string;
  price10g?: string;
};

export type CommodityDefinition = {
  code: string;
  name: string;
};

const DEFAULT_COMMODITY_CITY = 'meerut';
const GRAMS_PER_TEN_GRAM_RATE = 10;
const HINDUSTAN_TIMES_EXTENDED_HISTORY_WINDOW_DAYS = 730;
const HINDUSTAN_TIMES_STANDARD_HISTORY_WINDOW_DAYS = 365;
const INDIAN_RUPEE = 'INR';
const MINIMUM_HISTORY_WINDOW_DAYS = 30;
const MONTH_INDEX_APRIL = 3;
const MONTH_INDEX_AUGUST = 7;
const MONTH_INDEX_DECEMBER = 11;
const MONTH_INDEX_FEBRUARY = 1;
const MONTH_INDEX_JANUARY = 0;
const MONTH_INDEX_JULY = 6;
const MONTH_INDEX_JUNE = 5;
const MONTH_INDEX_MARCH = 2;
const MONTH_INDEX_MAY = 4;
const MONTH_INDEX_NOVEMBER = 10;
const MONTH_INDEX_OCTOBER = 9;
const MONTH_INDEX_SEPTEMBER = 8;
const UPSTOX_SOURCE = 'upstox';
const YAHOO_SOURCE = 'yahoo-finance';
const GROWW_SOURCE = 'groww';
const PERCENT = 100;
const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const US_DOLLAR = 'USD';
const SECONDS_TO_MS = 1000;

const UPSTOX_HEADERS: HeadersInit = {
  'User-Agent': DEFAULT_USER_AGENT,
  Accept: 'application/json',
  Referer: `https://upstox.com/gold-rates/gold-rates-in-${DEFAULT_COMMODITY_CITY}/`,
};

const HINDUSTAN_TIMES_HEADERS: HeadersInit = {
  'User-Agent': DEFAULT_USER_AGENT,
  Accept: 'application/json',
};

const monthByShortName = new Map<string, number>([
  ['Jan', MONTH_INDEX_JANUARY],
  ['Feb', MONTH_INDEX_FEBRUARY],
  ['Mar', MONTH_INDEX_MARCH],
  ['Apr', MONTH_INDEX_APRIL],
  ['May', MONTH_INDEX_MAY],
  ['Jun', MONTH_INDEX_JUNE],
  ['Jul', MONTH_INDEX_JULY],
  ['Aug', MONTH_INDEX_AUGUST],
  ['Sep', MONTH_INDEX_SEPTEMBER],
  ['Oct', MONTH_INDEX_OCTOBER],
  ['Nov', MONTH_INDEX_NOVEMBER],
  ['Dec', MONTH_INDEX_DECEMBER],
]);

const COMEX_SYMBOLS = new Map([
  ['gold', 'GC=F'],
  ['silver', 'SI=F'],
]);

const commodityDefinitions = new Map<string, CommodityDefinition>([
  [
    'gold',
    {
      code: 'gold',
      name: 'Gold',
    },
  ],
  [
    'silver',
    {
      code: 'silver',
      name: 'Silver',
    },
  ],
]);

export const commodityList = [...commodityDefinitions.values()];

export const getCommodityDefinition = (code: string): CommodityDefinition | undefined => {
  return commodityDefinitions.get(code.trim().toLowerCase());
};

const parseDateString = (value: string): Date | null => {
  const normalized = value.replace(',', '').trim();
  const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(normalized);
  if (match === null) {
    return null;
  }

  const [, dayRaw, monthRaw, yearRaw] = match;
  const month = monthByShortName.get(monthRaw);
  if (month === undefined) {
    return null;
  }

  const day = Number(dayRaw);
  const year = Number(yearRaw);
  if (Number.isNaN(day) || Number.isNaN(year)) {
    return null;
  }

  return new Date(year, month, day);
};

const parseFiniteNumber = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = parseNumericString(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

const getUpstoxOverviewUrl = (definition: CommodityDefinition): string => {
  if (definition.code === 'gold') {
    return `https://service.upstox.com/commodity/open/v1/gold-price/overview?city=${DEFAULT_COMMODITY_CITY}`;
  }
  return `https://service.upstox.com/commodity/open/v1/silver-price/overview?city=${DEFAULT_COMMODITY_CITY}`;
};

const getHindustanTimesHistoryUrl = (definition: CommodityDefinition, days: number): string => {
  return `https://api.hindustantimes.com/datainsight/goldsilver/gethistoricaldata/${definition.code}/${DEFAULT_COMMODITY_CITY}/${days}`;
};

const fetchGrowwPage = async <T>(path: string): Promise<T | null> => {
  const html = await fetchText(`https://groww.in/${path}`, {
    cache: 'no-store',
    headers: { 'User-Agent': DEFAULT_USER_AGENT },
  });
  const json = NEXT_DATA_PATTERN.exec(html ?? '')?.[1];
  if (json === undefined) {
    return null;
  }
  try {
    return (JSON.parse(json) as { props?: { pageProps?: T } }).props?.pageProps ?? null;
  } catch {
    return null;
  }
};

const fetchGrowwGoldRate = async (): Promise<PhysicalRate | null> => {
  const page = await fetchGrowwPage<GrowwGoldPage>('gold-rates');
  const rate = page?.goldRateData?.physicalGoldRate?.[DEFAULT_COMMODITY_CITY];
  const price = parseFiniteNumber(rate?.price?.TWENTY_FOUR);
  if (price === null) {
    return null;
  }
  const change = rate?.percentageChange?.TWENTY_FOUR;
  return {
    price,
    previous: change === undefined ? null : price / (1 + change / PERCENT),
    date: rate?.date === undefined ? null : new Date(rate.date),
  };
};

const fetchGrowwSilverPage = async () => fetchGrowwPage<GrowwSilverPage>('silver-rates');

const fetchGrowwSilverRate = async (): Promise<PhysicalRate | null> => {
  const page = await fetchGrowwSilverPage();
  const rate = page?.cityRates?.find((city) => city.slug === DEFAULT_COMMODITY_CITY);
  const price = parseFiniteNumber(rate?.todayPrice);
  if (price === null) {
    return null;
  }
  return {
    price,
    previous: parseFiniteNumber(rate?.yesterdayPrice),
    date: page?.snapshotDate === undefined ? null : new Date(page.snapshotDate),
  };
};

const fetchPhysicalRate = async (definition: CommodityDefinition) =>
  definition.code === 'gold' ? fetchGrowwGoldRate() : fetchGrowwSilverRate();

const fetchGrowwSilverHistory = async (): Promise<PriceHistoryPoint[]> => {
  const page = await fetchGrowwSilverPage();
  return (page?.silverHistoricalRates ?? []).flatMap((point) => {
    const price = parseFiniteNumber(point.pricePerGram);
    return point.date === undefined || price === null
      ? []
      : [{ date: new Date(point.date), price }];
  });
};

const buildUpstoxHistoryPoints = (
  definition: CommodityDefinition,
  payload: UpstoxGoldOverviewResponse | UpstoxSilverOverviewResponse | null,
): PriceHistoryPoint[] => {
  const recentPoints = payload?.data?.valueOver10days ?? [];

  return recentPoints.flatMap((point) => {
    const date = point.date === undefined ? null : parseDateString(point.date);
    const price =
      definition.code === 'gold'
        ? parseFiniteNumber((point as { price24k?: number }).price24k)
        : parseFiniteNumber((point as { price?: number }).price);
    if (date === null || price === null) {
      return [];
    }
    return [
      {
        date,
        price,
      },
    ];
  });
};

const buildHindustanTimesHistoryPoints = (
  definition: CommodityDefinition,
  payload: Array<HindustanTimesGoldHistoryPoint | HindustanTimesSilverHistoryPoint> | null,
): PriceHistoryPoint[] => {
  const historyPoints = payload ?? [];

  return historyPoints.flatMap((point) => {
    const date = point.date === undefined ? null : new Date(point.date);
    if (date === null || Number.isNaN(date.getTime())) {
      return [];
    }

    const rawPrice =
      definition.code === 'gold'
        ? parseFiniteNumber((point as HindustanTimesGoldHistoryPoint).price24Cr)
        : parseFiniteNumber((point as HindustanTimesSilverHistoryPoint).price10g);
    if (rawPrice === null) {
      return [];
    }

    const price = rawPrice / GRAMS_PER_TEN_GRAM_RATE;
    return [
      {
        date,
        price,
      },
    ];
  });
};

const buildHistoryWindowInDays = (startDate: Date): number => {
  const today = startOfDay(new Date());
  const requestedStart = startOfDay(startDate);
  const requestedDays = Math.ceil((today.getTime() - requestedStart.getTime()) / DAY_IN_MS) + 1;
  if (requestedDays > HINDUSTAN_TIMES_STANDARD_HISTORY_WINDOW_DAYS) {
    return HINDUSTAN_TIMES_EXTENDED_HISTORY_WINDOW_DAYS;
  }
  return Math.max(requestedDays, MINIMUM_HISTORY_WINDOW_DAYS);
};

const mergeHistoryPoints = (
  primaryPoints: PriceHistoryPoint[],
  overridePoints: PriceHistoryPoint[],
  startDate: Date,
  endDate: Date,
): PriceHistoryPoint[] => {
  const startTime = startOfDay(startDate).getTime();
  const endTime = startOfDay(endDate).getTime();
  const merged = new Map<number, PriceHistoryPoint>();

  for (const point of primaryPoints) {
    const time = startOfDay(point.date).getTime();
    merged.set(time, {
      date: startOfDay(point.date),
      price: point.price,
    });
  }

  for (const point of overridePoints) {
    const time = startOfDay(point.date).getTime();
    merged.set(time, {
      date: startOfDay(point.date),
      price: point.price,
    });
  }

  return [...merged.entries()]
    .filter(([time]) => time >= startTime && time <= endTime)
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
};

export const fetchCommodityLiveQuote = instrumentedFunction(
  'fetchCommodityLiveQuote',
  async (definition: CommodityDefinition): Promise<Quote | null> => {
    const physical = await fetchPhysicalRate(definition);
    if (physical !== null) {
      return {
        unitPriceInr: physical.price,
        unitPriceNative: physical.price,
        nativeCurrency: INDIAN_RUPEE,
        fxRateToInr: 1,
        asOf: physical.date,
        source: GROWW_SOURCE,
        previousCloseInr: physical.previous,
      };
    }
    const payload = await fetchLiveJson<UpstoxGoldOverviewResponse | UpstoxSilverOverviewResponse>(
      getUpstoxOverviewUrl(definition),
      {
        cache: 'no-store',
        headers: UPSTOX_HEADERS,
      },
    );

    const dailyPrice =
      definition.code === 'gold'
        ? (payload as UpstoxGoldOverviewResponse | null)?.data?.price24k
        : (payload as UpstoxSilverOverviewResponse | null)?.data?.price;
    const unitPrice = parseFiniteNumber(dailyPrice?.today);
    if (unitPrice === null) {
      return null;
    }

    const asOfRaw = payload?.data?.updatedDate;
    const asOf = asOfRaw === undefined ? null : parseDateString(asOfRaw);

    return {
      unitPriceInr: unitPrice,
      unitPriceNative: unitPrice,
      nativeCurrency: INDIAN_RUPEE,
      fxRateToInr: 1,
      asOf,
      source: UPSTOX_SOURCE,
      previousCloseInr: parseFiniteNumber(dailyPrice?.yesterday),
    };
  },
);

export const fetchYahooChartQuote = async (
  symbol: string,
  nativeCurrency: string,
): Promise<Quote | null> => {
  const payload = await fetchLiveJson<YahooChartResponse>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`,
    {
      cache: 'no-store',
      headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
    },
  );
  const meta = payload?.chart?.result?.[0]?.meta;
  const unitPrice = parseFiniteNumber(meta?.regularMarketPrice);
  if (unitPrice === null) {
    return null;
  }
  return {
    unitPriceInr: unitPrice,
    unitPriceNative: unitPrice,
    nativeCurrency,
    fxRateToInr: null,
    asOf:
      meta?.regularMarketTime === undefined
        ? null
        : new Date(meta.regularMarketTime * SECONDS_TO_MS),
    source: YAHOO_SOURCE,
    previousCloseInr: parseFiniteNumber(meta?.chartPreviousClose),
  };
};

export const fetchComexQuote = instrumentedFunction(
  'fetchComexQuote',
  async (definition: CommodityDefinition): Promise<Quote | null> => {
    const symbol = COMEX_SYMBOLS.get(definition.code);
    return symbol === undefined ? null : fetchYahooChartQuote(symbol, US_DOLLAR);
  },
);

export const fetchCommodityHistoricalPrices = instrumentedFunction(
  'fetchCommodityHistoricalPrices',
  async (
    definition: CommodityDefinition,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceHistoryPoint[]> => {
    const [upstoxOverview, hindustanTimesHistory, physical, silverHistory] = await Promise.all([
      fetchJson<UpstoxGoldOverviewResponse | UpstoxSilverOverviewResponse>(
        getUpstoxOverviewUrl(definition),
        {
          cache: 'no-store',
          headers: UPSTOX_HEADERS,
        },
      ),
      fetchJson<Array<HindustanTimesGoldHistoryPoint | HindustanTimesSilverHistoryPoint>>(
        getHindustanTimesHistoryUrl(definition, buildHistoryWindowInDays(startDate)),
        {
          cache: 'no-store',
          headers: HINDUSTAN_TIMES_HEADERS,
        },
      ),
      fetchPhysicalRate(definition),
      definition.code === 'silver' ? fetchGrowwSilverHistory() : Promise.resolve([]),
    ]);

    const historicalPoints = buildHindustanTimesHistoryPoints(definition, hindustanTimesHistory);
    const exactRecentPoints = [
      ...(silverHistory.length > 0
        ? silverHistory
        : buildUpstoxHistoryPoints(definition, upstoxOverview)),
      ...(physical?.date === null || physical?.date === undefined
        ? []
        : [{ date: physical.date, price: physical.price }]),
    ];

    return mergeHistoryPoints(historicalPoints, exactRecentPoints, startDate, endDate);
  },
);
