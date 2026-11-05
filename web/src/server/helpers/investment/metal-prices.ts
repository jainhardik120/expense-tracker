import { subDays } from 'date-fns';
import { and, desc, eq, sql } from 'drizzle-orm';

import { instrumentAssetClasses, investments } from '@/db/schema';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import type { AssetClassTagValue } from '@/lib/investments';
import { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from '@/types';

import {
  candlesToPrices,
  fetchIndianRangePrices,
  fetchUsPrices,
  type GrowwCandle,
} from './intraday';
import { cachedQuotes } from './market-cache';
import { isIndianMarketOpen } from './market-hours';
import { estimateClosedHours, mergeSeries } from './metal-estimates';
import {
  fetchCommodityHistoricalPrices,
  fetchCommodityLiveQuote,
  fetchComexQuote,
  getCommodityDefinition,
  type CommodityDefinition,
} from './providers/commodity-market-data';
import { IndiaStockInvestmentProvider } from './providers/india-stock-investment-provider';
import { parseIndianListing } from './providers/indian-listing';
import {
  createInstrumentKey,
  DAY_IN_MS,
  DEFAULT_USER_AGENT,
  fetchLiveJson,
  fetchText,
  startOfDay,
} from './shared';

import type { PriceHistoryPoint, Quote } from './types';

const INDIA_RATE_TTL_MINUTES = 5;
const INDIA_RATE_TTL_MS = INDIA_RATE_TTL_MINUTES * MS_PER_MINUTE;
const LIVE_TTL_MS = MS_PER_MINUTE;
const CLOSED_ETF_TTL_MINUTES = 30;
const CLOSED_ETF_TTL_MS = CLOSED_ETF_TTL_MINUTES * MS_PER_MINUTE;
const PERCENT = 100;
const GROWW_API = 'https://groww.in/v1/api';
const CANDLE_MINUTES = 5;
const DAILY_CANDLE_MINUTES = 1440;
const CONVERSION_WINDOW_DAYS = 35;
const CHART_WINDOW_DAYS = 7;
const COMEX_HISTORY_RANGE = '1mo';
const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * MS_PER_MINUTE;
const DAY_KEY_LENGTH = 10;
const CONTRACT_DETAILS_LENGTH = 2000;

const REQUEST_INIT: RequestInit = {
  cache: 'no-store',
  headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
};

export const metalChartRanges = ['1d', '1w'] as const;

type MetalChartRange = (typeof metalChartRanges)[number];

const METALS: Record<
  AssetClassTagValue,
  { unit: string; gramsPerUnit: number; page: string; comexSymbol: string; defaultEtf: string }
> = {
  gold: {
    unit: '10 g',
    gramsPerUnit: 10,
    page: 'mcx_gold',
    comexSymbol: 'GC=F',
    defaultEtf: 'GOLDBEES.NS',
  },
  silver: {
    unit: 'kg',
    gramsPerUnit: 1000,
    page: 'mcx_silver',
    comexSymbol: 'SI=F',
    defaultEtf: 'SILVERBEES.NS',
  },
};

const METAL_CODES = ['gold', 'silver'] as const;

const indiaStocks = new IndiaStockInvestmentProvider();

const definitionOf = (metal: AssetClassTagValue) =>
  getCommodityDefinition(metal) as CommodityDefinition;

const changeFrom = (quote: Quote) => {
  const previous = quote.previousCloseInr ?? null;
  return previous === null ? null : ((quote.unitPriceNative - previous) / previous) * PERCENT;
};

const scaled = (quote: Quote | undefined, multiplier = 1) =>
  quote === undefined
    ? null
    : {
        price: quote.unitPriceNative * multiplier,
        changePercentage: changeFrom(quote),
        asOf: quote.asOf,
      };

const findMcxContract = async (metal: AssetClassTagValue) => {
  const html = await fetchText(
    `https://groww.in/commodities/futures/${METALS[metal].page}`,
    REQUEST_INIT,
  );
  const start = html?.indexOf('"contractDetails":') ?? -1;
  const details = start === -1 ? '' : (html?.slice(start, start + CONTRACT_DETAILS_LENGTH) ?? '');
  const token = /"token":(\d+)/.exec(details)?.[1];
  const name = /"displayName":"([^"]+)"/.exec(details)?.[1];
  return token === undefined ? null : { token, name: name ?? '' };
};

const fetchMcxQuote = async (metal: AssetClassTagValue): Promise<Quote | null> => {
  const contract = await findMcxContract(metal);
  if (contract === null) {
    return null;
  }
  const payload = await fetchLiveJson<{
    ltp?: number;
    close?: number;
    lastTradeTime?: number;
  }>(
    `${GROWW_API}/commodity_fo/v1/tr_live_prices/exchange/MCX/segment/COMMODITY/${contract.token}/latest`,
    REQUEST_INIT,
  );
  if (payload?.ltp === undefined) {
    return null;
  }
  return {
    unitPriceInr: payload.ltp,
    unitPriceNative: payload.ltp,
    nativeCurrency: 'INR',
    fxRateToInr: 1,
    asOf:
      payload.lastTradeTime === undefined ? null : new Date(payload.lastTradeTime * MS_PER_SECOND),
    source: 'groww',
    previousCloseInr: payload.close ?? null,
  };
};

const fetchGrowwCandles = async (
  path: string,
  start: number,
  end: number,
  intervalMinutes: number,
  maxAgeMs: number,
): Promise<PriceHistoryPoint[]> => {
  const payload = await fetchLiveJson<{ candles?: GrowwCandle[] }>(
    `${GROWW_API}/${path}?endTimeInMillis=${String(end)}&intervalInMinutes=${String(intervalMinutes)}&startTimeInMillis=${String(start)}`,
    REQUEST_INIT,
    maxAgeMs,
  );
  return candlesToPrices(payload?.candles ?? []);
};

const mcxCandles = async (
  metal: AssetClassTagValue,
  start: number,
  end: number,
  intervalMinutes: number,
  maxAgeMs: number,
) => {
  const contract = await findMcxContract(metal);
  return contract === null
    ? []
    : fetchGrowwCandles(
        `commodity_fo/charting_service/v4/chart/exchange/MCX/segment/COMMODITY/${contract.token}`,
        start,
        end,
        intervalMinutes,
        maxAgeMs,
      );
};

const dayOf = (date: Date) => date.toISOString().slice(0, DAY_KEY_LENGTH);

const median = (values: number[]) => {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted.length === 0 ? null : (sorted[Math.floor(sorted.length / 2)] ?? null);
};

const getEtfConversion = async (metal: AssetClassTagValue, code: string) => {
  const end = Math.floor(Date.now() / MS_PER_HOUR) * MS_PER_HOUR;
  const start = subDays(new Date(end), CONVERSION_WINDOW_DAYS).getTime();
  const { exchange, symbol } = parseIndianListing(code);
  const [etf, mcx] = await Promise.all([
    fetchGrowwCandles(
      `charting_service/v4/chart/exchange/${exchange}/segment/CASH/${encodeURIComponent(symbol)}`,
      start,
      end,
      DAILY_CANDLE_MINUTES,
      MS_PER_HOUR,
    ),
    mcxCandles(metal, start, end, DAILY_CANDLE_MINUTES, MS_PER_HOUR),
  ]);
  const mcxByDay = new Map(mcx.map((point) => [dayOf(point.date), point.price]));
  return median(
    etf.flatMap((point) => {
      const rate = mcxByDay.get(dayOf(point.date));
      return rate === undefined || point.price <= 0 ? [] : [rate / point.price];
    }),
  );
};

const getReferenceEtf = async (db: Database, userId: string, metal: AssetClassTagValue) => {
  const holdings = await db
    .select({ code: investments.instrumentCode })
    .from(investments)
    .innerJoin(
      instrumentAssetClasses,
      and(
        eq(instrumentAssetClasses.userId, investments.userId),
        eq(instrumentAssetClasses.investmentKind, investments.investmentKind),
        eq(instrumentAssetClasses.instrumentCode, investments.instrumentCode),
      ),
    )
    .where(
      and(
        eq(investments.userId, userId),
        eq(investments.investmentKind, 'stocks'),
        eq(investments.isClosed, false),
        eq(instrumentAssetClasses.assetClass, metal),
      ),
    )
    .groupBy(investments.instrumentCode)
    .orderBy(desc(sql`sum(${investments.investmentAmount})`))
    .limit(1);
  return holdings.at(0)?.code ?? METALS[metal].defaultEtf;
};

const etfKey = (code: string) => createInstrumentKey('stocks', code, 'IN');

const loadEtfQuotes = async (codes: string[]) =>
  cachedQuotes(
    codes.map((code) => ({
      key: etfKey(code),
      ttlMs: isIndianMarketOpen(new Date()) ? LIVE_TTL_MS : CLOSED_ETF_TTL_MS,
    })),
    () =>
      indiaStocks.getLiveQuotes(
        codes.map((code) => ({ kind: 'stocks' as const, code, stockMarket: 'IN' as const })),
      ),
  );

const loadMetalQuotes = async <T>(
  ttlMs: number,
  keyOf: (metal: AssetClassTagValue) => string,
  fetchQuote: (metal: AssetClassTagValue) => Promise<T | null>,
) =>
  cachedQuotes(
    METAL_CODES.map((metal) => ({ key: keyOf(metal), ttlMs })),
    async (keys) => {
      const quotes = new Map<string, Quote>();
      await Promise.all(
        METAL_CODES.filter((metal) => keys.includes(keyOf(metal))).map(async (metal) => {
          const quote = await fetchQuote(metal);
          if (quote !== null) {
            quotes.set(keyOf(metal), quote as Quote);
          }
        }),
      );
      return quotes;
    },
  );

const indiaKey = (metal: AssetClassTagValue) => createInstrumentKey('commodities', metal);

const comexKey = (metal: AssetClassTagValue) => `commodities:comex:${metal}`;

const mcxKey = (metal: AssetClassTagValue) => `commodities:mcx:${metal}`;

export const getMetalPrices = instrumentedFunction(
  'getMetalPrices',
  async (db: Database, userId: string) => {
    const etfCodes = await Promise.all(
      METAL_CODES.map(async (metal) => getReferenceEtf(db, userId, metal)),
    );
    const [indiaQuotes, comexQuotes, mcxQuotes, etfQuotes, conversions, contracts] =
      await Promise.all([
        loadMetalQuotes(INDIA_RATE_TTL_MS, indiaKey, async (metal) =>
          fetchCommodityLiveQuote(definitionOf(metal)),
        ),
        loadMetalQuotes(LIVE_TTL_MS, comexKey, async (metal) =>
          fetchComexQuote(definitionOf(metal)),
        ),
        loadMetalQuotes(LIVE_TTL_MS, mcxKey, fetchMcxQuote),
        loadEtfQuotes(etfCodes),
        Promise.all(
          METAL_CODES.map(async (metal, index) =>
            getEtfConversion(metal, etfCodes[index] as string),
          ),
        ),
        Promise.all(METAL_CODES.map(findMcxContract)),
      ]);
    return METAL_CODES.map((metal, index) => {
      const { unit, gramsPerUnit } = METALS[metal];
      const code = etfCodes[index] as string;
      const quote = etfQuotes.get(etfKey(code));
      const conversion = conversions[index] ?? null;
      const etfRate = conversion === null ? null : scaled(quote, conversion);
      return {
        code: metal,
        name: definitionOf(metal).name,
        unit,
        etf:
          etfRate === null
            ? null
            : {
                ...etfRate,
                symbol: parseIndianListing(code).symbol,
                unitPrice: quote?.unitPriceNative ?? 0,
              },
        mcx: scaled(mcxQuotes.get(mcxKey(metal))),
        contract: contracts[index]?.name ?? '',
        india: scaled(indiaQuotes.get(indiaKey(metal)), gramsPerUnit),
        comex: scaled(comexQuotes.get(comexKey(metal))),
      };
    });
  },
);

const toSeries = (points: PriceHistoryPoint[], from: number, multiplier = 1) =>
  points
    .filter(({ date }) => date.getTime() >= from)
    .map(({ date, price }) => ({ time: date.getTime(), price: price * multiplier }));

const istDayStart = (time: number) =>
  Math.floor((time + IST_OFFSET_MS) / DAY_IN_MS) * DAY_IN_MS - IST_OFFSET_MS;

const toStepSeries = (
  points: PriceHistoryPoint[],
  from: number,
  to: number,
  multiplier: number,
) => {
  const before = points.findLast(({ date }) => date.getTime() < from);
  const series = toSeries(points, from, multiplier);
  const last = series.at(-1)?.price ?? (before === undefined ? null : before.price * multiplier);
  return [
    ...(before === undefined ? [] : [{ time: from, price: before.price * multiplier }]),
    ...series,
    ...(last === null ? [] : [{ time: to, price: last }]),
  ];
};

export const getMetalCharts = instrumentedFunction(
  'getMetalCharts',
  async (db: Database, userId: string, metal: AssetClassTagValue, range: MetalChartRange) => {
    const now = new Date();
    const end = Math.floor(now.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
    const windowStart = startOfDay(subDays(now, CHART_WINDOW_DAYS));
    const { unit, gramsPerUnit, comexSymbol } = METALS[metal];
    const code = await getReferenceEtf(db, userId, metal);
    const [etf, mcx, comex, india, conversion] = await Promise.all([
      fetchIndianRangePrices(code, windowStart, now),
      mcxCandles(metal, windowStart.getTime(), end, CANDLE_MINUTES, LIVE_TTL_MS),
      fetchUsPrices(comexSymbol, COMEX_HISTORY_RANGE),
      fetchCommodityHistoricalPrices(definitionOf(metal), subDays(windowStart, 1), now),
      getEtfConversion(metal, code),
    ]);
    const latest = mcx.at(-1)?.date.getTime() ?? end;
    const start = range === '1d' ? istDayStart(latest) : istDayStart(windowStart.getTime());
    const from = windowStart.getTime();
    const mcxRates = toSeries(mcx, from);
    const etfRates = conversion === null ? [] : toSeries(etf, from, conversion);
    const mcxEstimate = estimateClosedHours(mcxRates, toSeries(comex, from));
    const etfEstimate = estimateClosedHours(etfRates, mergeSeries(mcxRates, mcxEstimate));
    const inRange = ({ time }: { time: number }) => time >= start;
    return {
      unit,
      etfSymbol: parseIndianListing(code).symbol,
      start,
      end,
      etf: etfRates.filter(inRange),
      etfEstimate: etfEstimate.filter(inRange),
      mcx: mcxRates.filter(inRange),
      mcxEstimate: mcxEstimate.filter(inRange),
      comex: toSeries(comex, start),
      india: toStepSeries(india, start, end, gramsPerUnit),
    };
  },
);
