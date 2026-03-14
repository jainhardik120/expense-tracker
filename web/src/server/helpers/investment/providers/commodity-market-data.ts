import type { PriceHistoryPoint, Quote } from '../types';

import {
  DAY_IN_MS,
  DEFAULT_USER_AGENT,
  fetchJson,
  parseNumericString,
  startOfDay,
} from '../shared';

type UpstoxGoldOverviewResponse = {
  success?: boolean;
  data?: {
    updatedDate?: string;
    price24k?: {
      today?: number;
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
    };
    valueOver10days?: Array<{
      date?: string;
      price?: number;
    }>;
  };
};

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

export const fetchCommodityLiveQuote = async (
  definition: CommodityDefinition,
): Promise<Quote | null> => {
  const payload = await fetchJson<UpstoxGoldOverviewResponse | UpstoxSilverOverviewResponse>(
    getUpstoxOverviewUrl(definition),
    {
      cache: 'no-store',
      headers: UPSTOX_HEADERS,
    },
  );

  const unitPrice =
    definition.code === 'gold'
      ? parseFiniteNumber((payload as UpstoxGoldOverviewResponse | null)?.data?.price24k?.today)
      : parseFiniteNumber((payload as UpstoxSilverOverviewResponse | null)?.data?.price?.today);
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
  };
};

export const fetchCommodityHistoricalPrices = async (
  definition: CommodityDefinition,
  startDate: Date,
  endDate: Date,
): Promise<PriceHistoryPoint[]> => {
  const [upstoxOverview, hindustanTimesHistory] = await Promise.all([
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
  ]);

  const historicalPoints = buildHindustanTimesHistoryPoints(definition, hindustanTimesHistory);
  const exactRecentPoints = buildUpstoxHistoryPoints(definition, upstoxOverview);

  return mergeHistoryPoints(historicalPoints, exactRecentPoints, startDate, endDate);
};
