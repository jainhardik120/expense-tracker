import { subDays } from 'date-fns';

import { instrumentedFunction } from '@/lib/instrumentation';
import {
  PORTFOLIO_VIEW,
  matchesSelection,
  parseCategoryViewValue,
  parseViewValue,
} from '@/lib/investment-selection';
import type { InvestmentTimelineRangeValue } from '@/lib/investments';
import { MS_PER_MINUTE, MS_PER_SECOND } from '@/types';

import { getInvestmentsDashboard } from './dashboard';
import { enrichInvestments } from './enrichment';
import { buildInstrumentTimelineEntries } from './holdings';
import { buildInvestmentMarketDataContext } from './market-data';
import { parseIndianListing } from './providers/indian-listing';
import { endAtLastPriceDay, getTimeRangeBounds } from './range';
import {
  createInstrumentKey,
  DEFAULT_USER_AGENT,
  fetchLiveJson,
  getFxRateToInrFromHistory,
  startOfDay,
} from './shared';
import { dateToDayKey, deriveUnits } from './utils';

import type { EnrichedInvestment } from './models';
import type { InvestmentRow, PriceHistoryPoint } from './types';

const BUCKET_MINUTES = 5;
const BUCKET_MS = BUCKET_MINUTES * MS_PER_MINUTE;
const STOCK_MEMO_MS = MS_PER_MINUTE;
const CRYPTO_MEMO_MS = BUCKET_MS;
const QUOTE_HISTORY_DAYS = 10;
const CANDLE_CLOSE_INDEX = 4;

type WideRange = '1w' | '1m';

const YAHOO_RANGES: Record<WideRange, string> = { '1w': '5d', '1m': '1mo' };

const COINGECKO_DAYS: Record<WideRange, number> = { '1w': 7, '1m': 30 };

const REQUEST_INIT: RequestInit = {
  cache: 'no-store',
  headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
};

type Holding = {
  position: EnrichedInvestment;
  value: number;
  previousValue: number;
  invested: number;
  units: number;
  prices: PriceHistoryPoint[];
};

export type GrowwCandle = [number, number, number, number, number, number];

export const candlesToPrices = (candles: GrowwCandle[]): PriceHistoryPoint[] =>
  candles.map((candle) => ({
    date: new Date(candle[0] * MS_PER_SECOND),
    price: candle[CANDLE_CLOSE_INDEX],
  }));

const fetchIndianPrices = async (code: string): Promise<PriceHistoryPoint[]> => {
  const { exchange, symbol } = parseIndianListing(code);
  const payload = await fetchLiveJson<{ candles?: Array<[number, number]> }>(
    `https://groww.in/v1/api/charting_service/v2/chart/exchange/${exchange}/segment/CASH/${encodeURIComponent(symbol)}/daily?intervalInMinutes=${String(BUCKET_MINUTES)}&minimal=true`,
    REQUEST_INIT,
    STOCK_MEMO_MS,
  );
  return (payload?.candles ?? []).map(([seconds, price]) => ({
    date: new Date(seconds * MS_PER_SECOND),
    price,
  }));
};

export const fetchIndianRangePrices = async (code: string, start: Date, now: Date) => {
  const { exchange, symbol } = parseIndianListing(code);
  const end = Math.floor(now.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
  const payload = await fetchLiveJson<{ candles?: GrowwCandle[] }>(
    `https://groww.in/v1/api/charting_service/v4/chart/exchange/${exchange}/segment/CASH/${encodeURIComponent(symbol)}?endTimeInMillis=${String(end)}&intervalInMinutes=${String(BUCKET_MINUTES)}&startTimeInMillis=${String(start.getTime())}`,
    REQUEST_INIT,
    STOCK_MEMO_MS,
  );
  return candlesToPrices(payload?.candles ?? []);
};

export const fetchUsPrices = async (code: string, range = '1d'): Promise<PriceHistoryPoint[]> => {
  const payload = await fetchLiveJson<{
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  }>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}?range=${range}&interval=${String(BUCKET_MINUTES)}m`,
    REQUEST_INIT,
    STOCK_MEMO_MS,
  );
  const result = payload?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  return (result?.timestamp ?? []).flatMap((seconds, index) => {
    const price = closes[index];
    return price === null ? [] : [{ date: new Date(seconds * MS_PER_SECOND), price }];
  });
};

const fetchCryptoPrices = async (code: string, days = 1): Promise<PriceHistoryPoint[]> => {
  const payload = await fetchLiveJson<{ prices?: Array<[number, number]> }>(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(code)}/market_chart?vs_currency=inr&days=${String(days)}`,
    REQUEST_INIT,
    CRYPTO_MEMO_MS,
  );
  return (payload?.prices ?? []).map(([milliseconds, price]) => ({
    date: new Date(milliseconds),
    price,
  }));
};

const fetchIntradayPrices = async (position: EnrichedInvestment) => {
  const code = position.instrumentCode?.trim() ?? '';
  if (code === '') {
    return [];
  }
  if (position.normalizedKind === 'crypto') {
    return fetchCryptoPrices(code);
  }
  if (position.normalizedKind !== 'stocks') {
    return [];
  }
  return position.normalizedStockMarket === 'US' ? fetchUsPrices(code) : fetchIndianPrices(code);
};

const fetchRangePrices = async (
  position: EnrichedInvestment,
  range: WideRange,
  start: Date,
  now: Date,
) => {
  const code = position.instrumentCode?.trim() ?? '';
  if (position.normalizedKind === 'crypto') {
    return fetchCryptoPrices(code, COINGECKO_DAYS[range]);
  }
  return position.normalizedStockMarket === 'US'
    ? fetchUsPrices(code, YAHOO_RANGES[range])
    : fetchIndianRangePrices(code, start, now);
};

const positionsForView = (positions: EnrichedInvestment[], view: string) => {
  if (view === PORTFOLIO_VIEW) {
    return positions.filter((position) => !position.isExcludedFromPortfolioPosition);
  }
  const category = parseCategoryViewValue(view);
  return positions.filter((position) =>
    matchesSelection(position, {
      category: category === null ? [] : [category],
      instrument: category === null ? [view] : [],
    }),
  );
};

const buildHoldings = async (positions: EnrichedInvestment[], useDisplayCurrency: boolean) => {
  const holdings = new Map<string, Holding>();
  for (const position of positions) {
    const code = position.instrumentCode?.trim() ?? '';
    const key =
      code === ''
        ? position.id
        : createInstrumentKey(position.normalizedKind, code, position.normalizedStockMarket);
    const invested = useDisplayCurrency
      ? position.investedAmountDisplay
      : position.investedAmountInr;
    const value =
      (useDisplayCurrency ? position.valuationAmountDisplay : position.valuationAmount) ?? invested;
    const dayChange = (useDisplayCurrency ? position.dayChangeDisplay : position.dayChange) ?? 0;
    const holding = holdings.get(key) ?? {
      position,
      value: 0,
      previousValue: 0,
      invested: 0,
      units: 0,
      prices: [],
    };
    holding.value += value;
    holding.previousValue += value - dayChange;
    holding.invested += invested;
    holding.units += deriveUnits({ units: position.units }) ?? 0;
    holdings.set(key, holding);
  }
  const list = [...holdings.values()];
  await Promise.all(
    list.map(async (holding) => {
      holding.prices = await fetchIntradayPrices(holding.position);
    }),
  );
  return list;
};

const pickSessionSeries = <T extends { position: EnrichedInvestment; prices: PriceHistoryPoint[] }>(
  series: T[],
) => {
  const priced = series.filter(({ prices }) => prices.length > 0);
  const stocks = priced.filter(({ position }) => position.normalizedKind === 'stocks');
  const indian = stocks.filter(({ position }) => position.normalizedStockMarket !== 'US');
  if (indian.length > 0) {
    return indian;
  }
  return stocks.length > 0 ? stocks : priced;
};

const bucketTimes = (series: Array<{ prices: PriceHistoryPoint[] }>, from: number) =>
  [
    ...new Set(
      series.flatMap(({ prices }) =>
        prices
          .map(({ date }) => date.getTime())
          .filter((time) => time >= from)
          .map((time) => Math.floor(time / BUCKET_MS) * BUCKET_MS),
      ),
    ),
  ].sort((left, right) => left - right);

const valueAt = (holding: Holding, time: number) => {
  const latest = holding.prices.at(-1);
  if (latest === undefined) {
    return holding.value;
  }
  const point = holding.prices.findLast(({ date }) => date.getTime() <= time);
  return point === undefined ? holding.previousValue : holding.value * (point.price / latest.price);
};

const buildDayTimeline = async (investmentsList: InvestmentRow[], view: string) => {
  const now = new Date();
  const context = await buildInvestmentMarketDataContext({
    investmentsList,
    historyStartDate: subDays(now, QUOTE_HISTORY_DAYS),
    historyEndDate: now,
  });
  const enriched = await enrichInvestments({ investmentsList, marketDataContext: context });
  const holdings = await buildHoldings(
    positionsForView(enriched, view).filter((position) => !position.isClosedPosition),
    parseViewValue(view) !== null,
  );

  const total = (read: (holding: Holding) => number) =>
    holdings.reduce((sum, holding) => sum + read(holding), 0);
  const units = total((holding) => holding.units);
  const previousClose = total((holding) => holding.previousValue);
  const toPoint = (date: Date, value: number) => ({
    date,
    value,
    base: previousClose,
    unitPrice: units > 0 ? value / units : 0,
  });

  const session = pickSessionSeries(holdings);
  const firstPrices = session.flatMap(({ prices }) => prices.at(0)?.date.getTime() ?? []);
  if (firstPrices.length === 0) {
    return [
      toPoint(startOfDay(now), previousClose),
      toPoint(
        now,
        total((holding) => holding.value),
      ),
    ];
  }
  const sessionStart = Math.min(...firstPrices);
  const times = bucketTimes(session, sessionStart);
  const lastTime = times.at(-1);
  return [
    toPoint(new Date(sessionStart - BUCKET_MS), previousClose),
    ...times.slice(0, -1).map((time) =>
      toPoint(
        new Date(time),
        total((holding) => valueAt(holding, time + BUCKET_MS)),
      ),
    ),
    ...(lastTime === undefined
      ? []
      : [
          toPoint(
            new Date(lastTime),
            total((holding) => holding.value),
          ),
        ]),
  ];
};

const hasMinutePrices = (position: EnrichedInvestment) =>
  (position.normalizedKind === 'stocks' || position.normalizedKind === 'crypto') &&
  (position.instrumentCode?.trim() ?? '') !== '';

const isHeldAt = (position: EnrichedInvestment, time: number) =>
  startOfDay(position.investmentDate).getTime() <= time &&
  (position.closedAt === null || startOfDay(position.closedAt).getTime() > time);

const pricesAt = (prices: PriceHistoryPoint[], times: number[]) => {
  let index = 0;
  return times.map((time) => {
    while (index + 1 < prices.length && (prices[index + 1]?.date.getTime() ?? time) <= time) {
      index += 1;
    }
    return prices[index]?.price ?? 0;
  });
};

const currentFigures = (positions: EnrichedInvestment[], isInstrument: boolean) => {
  const sum = (read: (position: EnrichedInvestment) => number) =>
    positions.reduce((total, position) => total + read(position), 0);
  return isInstrument
    ? {
        value: sum((position) => position.valuationAmountDisplay ?? position.investedAmountDisplay),
        base: sum((position) => position.investedAmountDisplay),
      }
    : {
        value: sum((position) => position.valuationAmount ?? position.investedAmountInr),
        base: sum((position) => position.investedAmountInr),
      };
};

const endOnCurrentValue = <
  T extends { date: Date; value: number; base: number; unitPrice: number },
>(
  points: T[],
  selected: EnrichedInvestment[],
  isInstrument: boolean,
) => {
  const open = selected.filter((position) => !position.isClosedPosition);
  const last = points.at(-1);
  if (open.length === 0 || last === undefined) {
    return points;
  }
  const pricedAt = Math.min(
    Date.now(),
    Math.max(...open.map((position) => position.valuationDate?.getTime() ?? 0)),
  );
  const closing = {
    ...last,
    ...currentFigures(open, isInstrument),
    unitPrice: isInstrument ? (open.at(0)?.liveUnitPriceDisplay ?? last.unitPrice) : last.unitPrice,
  };
  return pricedAt > last.date.getTime()
    ? [...points, { ...closing, date: new Date(pricedAt) }]
    : [...points.slice(0, -1), closing];
};

const buildRangeTimeline = async (
  investmentsList: InvestmentRow[],
  view: string,
  range: WideRange,
) => {
  const now = new Date();
  const earliest = investmentsList.reduce<Date>((first, investment) => {
    const day = startOfDay(investment.investmentDate);
    return day.getTime() < first.getTime() ? day : first;
  }, startOfDay(now));
  const { startDate, endDate } = getTimeRangeBounds(range, earliest);
  const context = await buildInvestmentMarketDataContext({
    investmentsList,
    historyStartDate: startDate,
    historyEndDate: endDate,
  });
  const enriched = await enrichInvestments({ investmentsList, marketDataContext: context });
  const selected = positionsForView(enriched, view).filter(
    (position) =>
      position.closedAt === null || startOfDay(position.closedAt).getTime() >= startDate.getTime(),
  );
  const minutePositions = selected.filter(hasMinutePrices);
  if (minutePositions.length === 0) {
    return [];
  }

  const groups = new Map<string, EnrichedInvestment[]>();
  for (const position of minutePositions) {
    const key = createInstrumentKey(
      position.normalizedKind,
      position.instrumentCode?.trim() ?? '',
      position.normalizedStockMarket,
    );
    groups.set(key, [...(groups.get(key) ?? []), position]);
  }
  const fetched = await Promise.all(
    [...groups.values()].map(async (positions) => ({
      positions,
      position: positions[0] as EnrichedInvestment,
      prices: (await fetchRangePrices(positions[0] as EnrichedInvestment, range, startDate, now))
        .filter(({ date }) => date.getTime() >= startDate.getTime())
        .sort((left, right) => left.date.getTime() - right.date.getTime()),
    })),
  );
  const series = fetched.filter(({ prices }) => prices.length > 0);
  const dailyPositions = [
    ...selected.filter((position) => !hasMinutePrices(position)),
    ...fetched.filter(({ prices }) => prices.length === 0).flatMap(({ positions }) => positions),
  ];
  const times = bucketTimes(pickSessionSeries(series), startDate.getTime());
  if (times.length === 0) {
    return [];
  }

  const dailyByDay = new Map(
    dailyPositions.length === 0
      ? []
      : (
          await getInvestmentsDashboard({
            investmentsList: dailyPositions,
            start: startDate,
            end: endDate,
            historyByInstrumentKey: context.historyByInstrumentKey,
            usdInrHistory: context.usdInrHistory,
            includeExcludedFromPortfolio: true,
          })
        ).timeline.map((point) => [dateToDayKey(point.date), point]),
  );
  const useDisplayCurrency = parseViewValue(view) !== null;
  const priced = series.map(({ positions, prices }) => ({
    positions,
    priceAt: pricesAt(
      prices,
      times.map((time) => time + BUCKET_MS),
    ),
  }));
  const rateFor = (position: EnrichedInvestment, date: Date) =>
    position.displayCurrency === 'USD' && !useDisplayCurrency
      ? (getFxRateToInrFromHistory(date, context.usdInrHistory, position.currentFxRateToInr) ?? 1)
      : 1;

  const points = times.map((time, timeIndex) => {
    const date = new Date(time);
    const daily = dailyByDay.get(dateToDayKey(date));
    let value = daily?.valuationAmount ?? 0;
    let base = daily?.investedAmount ?? 0;
    let units = 0;
    let unitPrice = 0;
    for (const { positions, priceAt } of priced) {
      const price = priceAt[timeIndex] ?? 0;
      unitPrice = price;
      for (const position of positions) {
        if (isHeldAt(position, time)) {
          const held = deriveUnits({ units: position.units }) ?? 0;
          units += held;
          value += held * price * rateFor(position, date);
          base += useDisplayCurrency ? position.investedAmountDisplay : position.investedAmountInr;
        }
      }
    }
    return { date, value, base, unitPrice: units > 0 || useDisplayCurrency ? unitPrice : 0 };
  });
  return endOnCurrentValue(points, selected, useDisplayCurrency);
};

const buildDailyTimeline = async (
  investmentsList: InvestmentRow[],
  view: string,
  range: InvestmentTimelineRangeValue,
) => {
  const now = new Date();
  const earliest = investmentsList.reduce<Date>((first, investment) => {
    const day = startOfDay(investment.investmentDate);
    return day.getTime() < first.getTime() ? day : first;
  }, startOfDay(now));
  const { startDate, endDate } = getTimeRangeBounds(range, earliest);
  const context = await buildInvestmentMarketDataContext({
    investmentsList,
    historyStartDate: startDate,
    historyEndDate: endDate,
  });
  const enriched = await enrichInvestments({ investmentsList, marketDataContext: context });
  const selected = positionsForView(enriched, view);
  if (selected.length === 0) {
    return [];
  }
  const history = {
    historyByInstrumentKey: context.historyByInstrumentKey,
    usdInrHistory: context.usdInrHistory,
  };
  const isInstrument = parseViewValue(view) !== null;
  const open = selected.filter((position) => !position.isClosedPosition);
  const current = currentFigures(open, isInstrument);
  const points = isInstrument
    ? (
        await buildInstrumentTimelineEntries({
          investmentsList: selected,
          startDate,
          endDate,
          ...history,
        })
      )
        .flatMap((entry) => entry.timeline.points)
        .map((point) => ({
          date: point.date,
          value: point.holdingValue,
          base: point.investedAmount,
          unitPrice: point.unitPrice,
        }))
    : (
        await getInvestmentsDashboard({
          investmentsList: selected,
          start: startDate,
          end: endDate,
          ...history,
          includeExcludedFromPortfolio: true,
        })
      ).timeline.map((point) => ({
        date: point.date,
        value: point.valuationAmount,
        base: point.investedAmount,
        unitPrice: 0,
      }));
  const priced = selected.every((position) => position.normalizedKind === 'mutual_funds')
    ? endAtLastPriceDay(
        points,
        open.map(
          (position) =>
            context.quoteByInstrumentKey.get(
              createInstrumentKey('mutual_funds', position.instrumentCode?.trim() ?? ''),
            )?.asOf,
        ),
      )
    : points;
  const last = priced.at(-1);
  return open.length === 0 || last === undefined
    ? priced
    : [
        ...priced.slice(0, -1),
        {
          ...last,
          ...current,
          unitPrice: isInstrument
            ? (open.at(0)?.liveUnitPriceDisplay ?? last.unitPrice)
            : last.unitPrice,
        },
      ];
};

export const buildFineTimeline = instrumentedFunction(
  'buildFineTimeline',
  async (investmentsList: InvestmentRow[], view: string, range: InvestmentTimelineRangeValue) => {
    if (range === '1d') {
      return { points: await buildDayTimeline(investmentsList, view), intraday: true };
    }
    if (range === '1w' || range === '1m') {
      const points = await buildRangeTimeline(investmentsList, view, range);
      if (points.length > 0) {
        return { points, intraday: true };
      }
    }
    return { points: await buildDailyTimeline(investmentsList, view, range), intraday: false };
  },
);
