import { subDays } from 'date-fns';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { instrumentAssetClasses, investments, marketPrices } from '@/db/schema';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import type { AssetClassTagValue } from '@/lib/investments';
import { istDay } from '@/server/helpers/groww/client';
import { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from '@/types';

import {
  candlesToPrices,
  fetchIndianRangePrices,
  fetchUsPrices,
  type GrowwCandle,
} from './intraday';
import { cachedQuotes, loadInstrumentRows, storedQuote } from './market-cache';
import { getMarketIndicators } from './market-indicators';
import { averageBuyPrices, type MetalBuy } from './metal-buy-prices';
import { estimateClosedHours, latestEstimatePercent, mergeSeries } from './metal-estimates';
import {
  fetchCommodityHistoricalPrices,
  getCommodityDefinition,
  type CommodityDefinition,
} from './providers/commodity-market-data';
import { parseIndianListing } from './providers/indian-listing';
import { latestSession } from './range';
import {
  createInstrumentKey,
  DAY_IN_MS,
  DEFAULT_USER_AGENT,
  fetchLiveJson,
  fetchText,
  startOfDay,
} from './shared';

import type { PriceHistoryPoint, Quote } from './types';

const LIVE_TTL_MS = MS_PER_MINUTE;
const PERCENT = 100;
const GROWW_API = 'https://groww.in/v1/api';
const CANDLE_MINUTES = 5;
const DAILY_CANDLE_MINUTES = 1440;
const CONVERSION_WINDOW_DAYS = 35;
const CHART_WINDOW_DAYS = 7;
const MCX_LOOKBACK_DAYS = 7;
const COMEX_HISTORY_RANGE = '1mo';
const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * MS_PER_MINUTE;
const DAY_KEY_LENGTH = 10;
const CONTRACT_DETAILS_LENGTH = 2000;

const REQUEST_INIT: RequestInit = {
  cache: 'no-store',
  headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
};

export const metalChartRanges = ['1d', '1w', '1m', '6m', '1y', '3y', '5y'] as const;

export const marketChartKeys = [
  'nifty',
  'sensex',
  'gold',
  'silver',
  'sp500',
  'nasdaq',
  'dow',
  'usdinr',
] as const;

export const marketChartRanges = ['1d', '1w', '1m', '6m', '1y', '3y', '5y'] as const;

type MarketChartKey = (typeof marketChartKeys)[number];

type MarketChartRange = (typeof marketChartRanges)[number];

const MARKET_CHART_WINDOWS: Record<MarketChartRange, { days: number; minutes: number }> = {
  '1d': { days: 6, minutes: 5 },
  '1w': { days: 7, minutes: 5 },
  '1m': { days: 30, minutes: 30 },
  '6m': { days: 183, minutes: DAILY_CANDLE_MINUTES },
  '1y': { days: 365, minutes: DAILY_CANDLE_MINUTES },
  '3y': { days: 1096, minutes: DAILY_CANDLE_MINUTES },
  '5y': { days: 1827, minutes: DAILY_CANDLE_MINUTES },
};

const YAHOO_CHART_SYMBOLS: Partial<Record<MarketChartKey, string>> = {
  sp500: '^GSPC',
  nasdaq: '^IXIC',
  dow: '^DJI',
  usdinr: 'USDINR=X',
};

const YAHOO_CHART_RANGES: Record<MarketChartRange, string> = {
  '1d': '5d',
  '1w': '5d',
  '1m': '1mo',
  '6m': '6mo',
  '1y': '1y',
  '3y': '3y',
  '5y': '5y',
};

const YAHOO_DAILY_INTERVAL = '1d';

const YAHOO_MONTH_STEP = 6;

const INDEX_CHART_PATHS: Partial<Record<MarketChartKey, string>> = {
  nifty: 'charting_service/v4/chart/exchange/NSE/segment/CASH/NIFTY',
  sensex: 'charting_service/v4/chart/exchange/BSE/segment/CASH/SENSEX',
};

type MetalChartRange = (typeof metalChartRanges)[number];

const METAL_CHART_WINDOWS: Record<
  MetalChartRange,
  { days: number; minutes: number; comexRange: string; comexInterval: string }
> = {
  '1d': {
    days: CHART_WINDOW_DAYS,
    minutes: CANDLE_MINUTES,
    comexRange: '1mo',
    comexInterval: '5m',
  },
  '1w': {
    days: CHART_WINDOW_DAYS,
    minutes: CANDLE_MINUTES,
    comexRange: '1mo',
    comexInterval: '5m',
  },
  '1m': { days: 30, minutes: 30, comexRange: '1mo', comexInterval: '30m' },
  '6m': { days: 183, minutes: DAILY_CANDLE_MINUTES, comexRange: '6mo', comexInterval: '1d' },
  '1y': { days: 365, minutes: DAILY_CANDLE_MINUTES, comexRange: '1y', comexInterval: '1d' },
  '3y': { days: 1096, minutes: DAILY_CANDLE_MINUTES, comexRange: '3y', comexInterval: '1d' },
  '5y': { days: 1827, minutes: DAILY_CANDLE_MINUTES, comexRange: '5y', comexInterval: '1d' },
};

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
        previousClose: quote.previousCloseInr ?? null,
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

const loadEtfCandles = async (code: string, start: Date, now: Date, minutes: number) => {
  if (minutes === CANDLE_MINUTES) {
    return fetchIndianRangePrices(code, start, now);
  }
  const { exchange, symbol } = parseIndianListing(code);
  return fetchGrowwCandles(
    `charting_service/v4/chart/exchange/${exchange}/segment/CASH/${encodeURIComponent(symbol)}`,
    start.getTime(),
    Math.floor(now.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE,
    minutes,
    minutes === DAILY_CANDLE_MINUTES ? MS_PER_HOUR : LIVE_TTL_MS,
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

const mcxKey = (metal: AssetClassTagValue) => `commodities:mcx:${metal}`;

const istDayKey = (date: Date) => dayOf(istDay(date.getTime()));

const loadMcxCloses = async (db: Database, metal: AssetClassTagValue, earliest: number) => {
  const instrumentKey = mcxKey(metal);
  const now = Math.floor(Date.now() / MS_PER_HOUR) * MS_PER_HOUR;
  const [saved, candles] = await Promise.all([
    db
      .select({ day: marketPrices.day, price: marketPrices.price })
      .from(marketPrices)
      .where(eq(marketPrices.instrumentKey, instrumentKey)),
    mcxCandles(
      metal,
      subDays(new Date(earliest), MCX_LOOKBACK_DAYS).getTime(),
      now,
      DAILY_CANDLE_MINUTES,
      MS_PER_HOUR,
    ),
  ]);
  const closes = new Map(saved.map((row) => [row.day, Number.parseFloat(row.price)]));
  const today = istDayKey(new Date());
  const fresh = candles.flatMap(({ date, price }) => {
    const day = istDayKey(date);
    return closes.has(day) ? [] : [{ instrumentKey, day, price }];
  });
  const finished = fresh.filter(({ day }) => day !== today);
  if (finished.length > 0) {
    await db
      .insert(marketPrices)
      .values(finished.map((row) => ({ ...row, price: row.price.toString() })))
      .onConflictDoNothing();
  }
  for (const { day, price } of fresh) {
    closes.set(day, price);
  }
  return closes;
};

export const getMetalBuyPrices = instrumentedFunction(
  'getMetalBuyPrices',
  async (db: Database, userId: string) => {
    const rows = await db
      .select({
        metal: instrumentAssetClasses.assetClass,
        code: investments.instrumentCode,
        date: investments.investmentDate,
        units: investments.units,
        amount: investments.investmentAmount,
      })
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
          isNotNull(investments.units),
          inArray(instrumentAssetClasses.assetClass, [...METAL_CODES]),
        ),
      );
    return Promise.all(
      METAL_CODES.flatMap((metal) => {
        const held = rows.filter((row) => row.metal === metal);
        return held.length === 0 ? [] : [{ metal, held }];
      }).map(async ({ metal, held }) => {
        const codes = [...new Set(held.map((row) => row.code ?? ''))];
        const earliest = Math.min(...held.map((row) => row.date.getTime()));
        const [conversions, mcxCloses] = await Promise.all([
          Promise.all(
            codes.map(async (code) => [code, await getEtfConversion(metal, code)] as const),
          ),
          loadMcxCloses(db, metal, earliest),
        ]);
        const buys: MetalBuy[] = held.map((row) => ({
          code: row.code ?? '',
          day: istDayKey(row.date),
          units: Number.parseFloat(row.units ?? '0'),
          amount: Number.parseFloat(row.amount),
        }));
        return { code: metal, ...averageBuyPrices(buys, new Map(conversions), mcxCloses) };
      }),
    );
  },
);

const withLatestPrice = <T extends { price: number }>(
  points: T[],
  price: number | null | undefined,
  moved: Partial<T> = {},
): T[] => {
  const last = points.at(-1);
  return last === undefined || price === null || price === undefined
    ? points
    : [...points.slice(0, -1), { ...last, ...moved, price }];
};

const toSeries = (points: PriceHistoryPoint[], from: number, multiplier = 1) =>
  points
    .filter(({ date }) => date.getTime() >= from)
    .map(({ date, price }) => ({ time: date.getTime(), price: price * multiplier }));

const istDayStart = (time: number) =>
  Math.floor((time + IST_OFFSET_MS) / DAY_IN_MS) * DAY_IN_MS - IST_OFFSET_MS;

const withLatestQuote = (
  points: Array<{ time: number; price: number }>,
  quote: Quote | undefined,
) => {
  const last = points.at(-1);
  const asOf = quote?.asOf?.getTime();
  if (
    quote !== undefined &&
    asOf !== undefined &&
    last !== undefined &&
    istDayStart(asOf) > istDayStart(last.time)
  ) {
    return [...points, { time: asOf, price: quote.unitPriceNative }];
  }
  return withLatestPrice(points, quote?.unitPriceNative);
};

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
    const window = METAL_CHART_WINDOWS[range];
    const windowStart = startOfDay(subDays(now, window.days));
    const intraday = window.minutes === CANDLE_MINUTES;
    const { unit, gramsPerUnit, comexSymbol } = METALS[metal];
    const code = await getReferenceEtf(db, userId, metal);
    const etfKey = createInstrumentKey('stocks', code, 'IN');
    const [mcxQuotes, etfRows, etf, mcx, comex, india, conversion] = await Promise.all([
      loadMetalQuotes(LIVE_TTL_MS, mcxKey, fetchMcxQuote),
      loadInstrumentRows([etfKey]),
      loadEtfCandles(code, windowStart, now, window.minutes),
      mcxCandles(
        metal,
        windowStart.getTime(),
        end,
        window.minutes,
        intraday ? LIVE_TTL_MS : MS_PER_HOUR,
      ),
      fetchUsPrices(comexSymbol, window.comexRange, window.comexInterval),
      fetchCommodityHistoricalPrices(definitionOf(metal), subDays(windowStart, 1), now),
      getEtfConversion(metal, code),
    ]);
    const latest = mcx.at(-1)?.date.getTime() ?? end;
    const start = range === '1d' ? istDayStart(latest) : istDayStart(windowStart.getTime());
    const from = windowStart.getTime();
    const mcxQuote = mcxQuotes.get(mcxKey(metal));
    const etfQuote = storedQuote(etfRows.get(etfKey));
    const etfCandles = conversion === null ? [] : toSeries(etf, from, conversion);
    const isCurrentQuote =
      (etfQuote?.asOf?.getTime() ?? 0) >= (etfCandles.at(-1)?.time ?? Number.POSITIVE_INFINITY);
    const mcxRates = intraday
      ? withLatestPrice(toSeries(mcx, from), mcxQuote?.unitPriceNative)
      : withLatestQuote(toSeries(mcx, from), mcxQuote);
    const etfRates = withLatestPrice(
      etfCandles,
      isCurrentQuote && etfQuote !== null && conversion !== null
        ? etfQuote.unitPriceNative * conversion
        : null,
      isCurrentQuote && etfQuote?.asOf !== null && etfQuote?.asOf !== undefined
        ? { time: etfQuote.asOf.getTime() }
        : {},
    );
    const etfPreviousClose = etfQuote?.previousCloseInr ?? null;
    const mcxEstimate = intraday ? estimateClosedHours(mcxRates, toSeries(comex, from)) : [];
    const etfEstimate = intraday
      ? estimateClosedHours(etfRates, mergeSeries(mcxRates, mcxEstimate))
      : [];
    const inRange = ({ time }: { time: number }) => time >= start;
    return {
      unit,
      etfSymbol: parseIndianListing(code).symbol,
      etfName: etfRows.get(etfKey)?.name ?? `${parseIndianListing(code).symbol} ETF`,
      start,
      end,
      etfNow: etfRates.at(-1)?.price ?? null,
      etfBase:
        range === '1d' && etfPreviousClose !== null && conversion !== null
          ? etfPreviousClose * conversion
          : null,
      mcxBase: range === '1d' ? (mcxQuote?.previousCloseInr ?? null) : null,
      etf: etfRates.filter(inRange),
      etfEstimate: etfEstimate.filter(inRange),
      mcx: mcxRates.filter(inRange),
      mcxEstimate: mcxEstimate.filter(inRange),
      comex: toSeries(comex, start),
      india: toStepSeries(india, start, end, gramsPerUnit),
    };
  },
);

export const getEtfEstimates = instrumentedFunction(
  'getEtfEstimates',
  async (db: Database, userId: string) => {
    const now = new Date();
    const end = Math.floor(now.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
    const windowStart = startOfDay(subDays(now, CHART_WINDOW_DAYS));
    const from = windowStart.getTime();
    const held = await db
      .selectDistinct({
        metal: instrumentAssetClasses.assetClass,
        code: investments.instrumentCode,
      })
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
          inArray(instrumentAssetClasses.assetClass, [...METAL_CODES]),
        ),
      );
    const percents = await Promise.all(
      METAL_CODES.map(async (metal) => {
        const codes = held.flatMap((row) =>
          row.metal === metal && row.code !== null ? [row.code] : [],
        );
        if (codes.length === 0) {
          return [];
        }
        const [mcx, comex] = await Promise.all([
          mcxCandles(metal, from, end, CANDLE_MINUTES, LIVE_TTL_MS),
          fetchUsPrices(METALS[metal].comexSymbol, COMEX_HISTORY_RANGE),
        ]);
        const mcxRates = toSeries(mcx, from);
        const reference = mergeSeries(
          mcxRates,
          estimateClosedHours(mcxRates, toSeries(comex, from)),
        );
        return Promise.all(
          codes.map(async (code) => {
            const etf = toSeries(await fetchIndianRangePrices(code, windowStart, now), from);
            const percent = latestEstimatePercent(etf, estimateClosedHours(etf, reference));
            return percent === null ? [] : [[code, percent] as const];
          }),
        ).then((entries) => entries.flat());
      }),
    );
    return { percents: Object.fromEntries(percents.flat()) };
  },
);

const loadMarketCandles = async (key: MarketChartKey, range: MarketChartRange) => {
  const symbol = YAHOO_CHART_SYMBOLS[key];
  const { days, minutes } = MARKET_CHART_WINDOWS[range];
  const daily = minutes === DAILY_CANDLE_MINUTES;
  if (symbol !== undefined) {
    const prices = daily
      ? await fetchUsPrices(symbol, YAHOO_CHART_RANGES[range], YAHOO_DAILY_INTERVAL)
      : await fetchUsPrices(symbol, YAHOO_CHART_RANGES[range]);
    return range === '1m'
      ? prices.filter((_, index) => index % YAHOO_MONTH_STEP === 0 || index === prices.length - 1)
      : prices;
  }
  const now = new Date();
  const end = Math.floor(now.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
  const start = startOfDay(subDays(now, days)).getTime();
  const path = INDEX_CHART_PATHS[key];
  const ttl = daily ? MS_PER_HOUR : LIVE_TTL_MS;
  return path === undefined
    ? mcxCandles(key as AssetClassTagValue, start, end, minutes, ttl)
    : fetchGrowwCandles(path, start, end, minutes, ttl);
};

export const getMarketSnapshot = instrumentedFunction('getMarketSnapshot', async () => {
  const [indicators, mcxQuotes] = await Promise.all([
    getMarketIndicators(),
    loadMetalQuotes(LIVE_TTL_MS, mcxKey, fetchMcxQuote),
  ]);
  const indicatorItem = (key: MarketChartKey) => {
    const indicator = indicators.find((item) => item.id === key);
    return {
      key,
      label: indicator?.label ?? key,
      unit: null,
      isCurrency: indicator?.isCurrency ?? false,
      price: indicator?.price ?? null,
      previousClose: indicator?.previousClose ?? null,
      changePercentage: indicator?.changePercentage ?? null,
    };
  };
  const metalItem = (metal: AssetClassTagValue, label: string) => {
    const quote = scaled(mcxQuotes.get(mcxKey(metal)));
    return {
      key: metal,
      label,
      unit: METALS[metal].unit,
      isCurrency: true,
      price: quote?.price ?? null,
      previousClose: quote?.previousClose ?? null,
      changePercentage: quote?.changePercentage ?? null,
    };
  };
  return {
    items: [
      indicatorItem('nifty'),
      indicatorItem('sensex'),
      metalItem('gold', 'Gold MCX'),
      metalItem('silver', 'Silver MCX'),
      indicatorItem('sp500'),
      indicatorItem('nasdaq'),
      indicatorItem('dow'),
      indicatorItem('usdinr'),
    ],
  };
});

export const getMarketChart = instrumentedFunction(
  'getMarketChart',
  async (key: MarketChartKey, range: MarketChartRange) => {
    const [points, snapshot] = await Promise.all([
      loadMarketCandles(key, range),
      getMarketSnapshot(),
    ]);
    const live = snapshot.items.find((item) => item.key === key);
    return {
      points: withLatestPrice(range === '1d' ? latestSession(points) : points, live?.price),
      previousClose: range === '1d' ? (live?.previousClose ?? null) : null,
    };
  },
);
