import { instrumentedFunction } from '@/lib/instrumentation';
import {
  isLivePriceInvestment,
  isUnitBasedInvestment,
  normalizeInvestmentKind,
  normalizeStockMarket,
  type InvestmentKindValue,
  type StockMarketValue,
} from '@/lib/investments';
import { MS_PER_MINUTE } from '@/types';

import { getUsdInrHistory, getUsdInrRate } from './fx';
import {
  cachedHistories,
  cachedNames,
  cachedQuotes,
  type InstrumentRow,
  loadInstrumentRows,
  readStoredPrices,
  storedQuote,
} from './market-cache';
import { isIndianMarketOpen } from './market-hours';
import { investmentInstrumentProviderRegistry } from './registry';
import { createInstrumentKey, DAY_IN_MS, getFxRateToInrFromHistory, startOfDay } from './shared';
import { getStockMarketFromInvestment } from './utils';

import type { InvestmentMarketDataContext } from './models';
import type { InvestmentInstrumentProvider } from './provider-interface';
import type {
  InstrumentIdentity,
  InvestmentInstrumentSearchResult,
  InvestmentRow,
  PriceHistoryPoint,
  Quote,
} from './types';

const FX_KEY = 'fx:USDINR';
const FX_TTL_MINUTES = 10;
const SLOW_QUOTE_TTL_MINUTES = 30;
const COMMODITY_TTL_MINUTES = 5;
const FX_TTL_MS = FX_TTL_MINUTES * MS_PER_MINUTE;
const FUND_QUOTE_TTL_MS = SLOW_QUOTE_TTL_MINUTES * MS_PER_MINUTE;
const CLOSED_MARKET_TTL_MS = SLOW_QUOTE_TTL_MINUTES * MS_PER_MINUTE;
const HISTORY_LOOKBACK_DAYS = 10;
const HISTORY_LOOKBACK_MS = HISTORY_LOOKBACK_DAYS * DAY_IN_MS;
const LIVE_TTL_MS = MS_PER_MINUTE;
const COMMODITY_TTL_MS = COMMODITY_TTL_MINUTES * MS_PER_MINUTE;

const instrumentKeyOf = (instrument: InstrumentIdentity) =>
  createInstrumentKey(instrument.kind, instrument.code, instrument.stockMarket);

const quoteTtlMs = (instrument: InstrumentIdentity, now: Date) => {
  if (instrument.kind === 'mutual_funds') {
    return FUND_QUOTE_TTL_MS;
  }
  if (instrument.kind === 'commodities') {
    return COMMODITY_TTL_MS;
  }
  if (instrument.kind === 'stocks' && normalizeStockMarket(instrument.stockMarket) === 'IN') {
    return isIndianMarketOpen(now) ? LIVE_TTL_MS : CLOSED_MARKET_TTL_MS;
  }
  return LIVE_TTL_MS;
};

const byKey = (instruments: InstrumentIdentity[]) =>
  new Map(instruments.map((instrument) => [instrumentKeyOf(instrument), instrument]));

const fromProviders = async <T>(
  instruments: InstrumentIdentity[],
  call: (
    provider: InvestmentInstrumentProvider,
    group: InstrumentIdentity[],
  ) => Promise<Map<string, T>>,
): Promise<Map<string, T>> => {
  const merged = new Map<string, T>();
  const groups = investmentInstrumentProviderRegistry.groupInstrumentsByProvider(instruments);
  const results = await Promise.all(
    [...groups.entries()].map(([provider, group]) => call(provider, group)),
  );
  for (const result of results) {
    for (const [key, value] of result) {
      merged.set(key, value);
    }
  }
  return merged;
};

const resolveInstrumentNames = async (
  instruments: InstrumentIdentity[],
  preloaded: Map<string, InstrumentRow>,
): Promise<Map<string, string>> => {
  const instrumentByKey = byKey(instruments);
  const resolved = await cachedNames(
    [...instrumentByKey.keys()],
    (keys) =>
      fromProviders(
        keys.flatMap((key) => instrumentByKey.get(key) ?? []),
        (provider, group) => provider.resolveNames(group),
      ),
    preloaded,
  );

  for (const instrument of instruments) {
    const normalizedCode = instrument.code.trim();
    if (normalizedCode === '') {
      continue;
    }
    const instrumentKey = createInstrumentKey(
      instrument.kind,
      normalizedCode,
      instrument.stockMarket,
    );
    if (!resolved.has(instrumentKey)) {
      resolved.set(instrumentKey, normalizedCode);
    }
  }

  return resolved;
};

export const searchInvestmentInstruments = instrumentedFunction(
  'searchInvestmentInstruments',
  async (
    kind: InvestmentKindValue,
    query: string,
    stockMarket: StockMarketValue = 'IN',
  ): Promise<InvestmentInstrumentSearchResult[]> => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      return [];
    }
    const provider = investmentInstrumentProviderRegistry.getProviderForKind(
      kind,
      kind === 'stocks' ? stockMarket : null,
    );
    if (provider === null) {
      return [];
    }
    return provider.search(normalizedQuery);
  },
);

export const getHistoricalUnitPrices = instrumentedFunction(
  'getHistoricalUnitPrices',
  async (
    kind: InvestmentKindValue,
    code: string,
    startDate: Date,
    endDate: Date,
    options?: {
      stockMarket?: StockMarketValue | null;
      usdInrRate?: number | null;
      usdInrHistory?: PriceHistoryPoint[];
    },
  ): Promise<PriceHistoryPoint[]> => {
    const effectiveStockMarket =
      kind === 'stocks' ? normalizeStockMarket(options?.stockMarket) : null;
    const provider = investmentInstrumentProviderRegistry.getProviderForKind(
      kind,
      effectiveStockMarket,
    );
    if (provider === null) {
      return [];
    }
    const instrument = { kind, code, stockMarket: effectiveStockMarket };
    const key = instrumentKeyOf(instrument);
    const histories = await cachedHistories(
      [{ key, start: startDate, end: endDate }],
      (_, start, end) =>
        provider.getHistoricalPrices(instrument, start, end, {
          usdInrRate: options?.usdInrRate ?? null,
          usdInrHistory: options?.usdInrHistory ?? [],
        }),
    );
    return histories.get(key) ?? [];
  },
);

const getUniqueInstruments = (
  investmentsList: InvestmentRow[],
  marketDataKinds?: InvestmentKindValue[],
): InstrumentIdentity[] => {
  const instrumentMap = new Map<string, InstrumentIdentity>();
  for (const investment of investmentsList) {
    const kind = normalizeInvestmentKind(investment.investmentKind);
    if (marketDataKinds !== undefined && !marketDataKinds.includes(kind)) {
      continue;
    }
    const code = investment.instrumentCode?.trim() ?? '';
    if (code === '') {
      continue;
    }
    const stockMarket = getStockMarketFromInvestment(investment);
    instrumentMap.set(createInstrumentKey(kind, code, stockMarket), {
      kind,
      code,
      stockMarket,
    });
  }
  return [...instrumentMap.values()];
};

const fxQuote = (rate: number): Quote => ({
  unitPriceInr: rate,
  unitPriceNative: 1,
  nativeCurrency: 'USD',
  fxRateToInr: rate,
  asOf: new Date(),
  source: 'yahoo-finance',
});

const needsUsdInr = (instrument: InstrumentIdentity) =>
  (instrument.kind === 'stocks' && normalizeStockMarket(instrument.stockMarket) === 'US') ||
  instrument.kind === 'commodities';

export const buildInvestmentMarketDataContext = instrumentedFunction(
  'buildInvestmentMarketDataContext',
  async ({
    investmentsList,
    historyStartDate,
    historyEndDate,
    marketDataKinds,
  }: {
    investmentsList: InvestmentRow[];
    historyStartDate?: Date;
    historyEndDate?: Date;
    marketDataKinds?: InvestmentKindValue[];
  }): Promise<InvestmentMarketDataContext> => {
    const now = new Date();
    const instruments = getUniqueInstruments(investmentsList, marketDataKinds);
    const liveInstruments = getUniqueInstruments(
      investmentsList.filter((investment) => !investment.isClosed),
      marketDataKinds,
    ).filter((instrument) => isLivePriceInvestment(instrument.kind));
    const unitInstruments = instruments.filter((instrument) =>
      isUnitBasedInvestment(instrument.kind),
    );
    const requiresUsdInrData = getUniqueInstruments(investmentsList).some(needsUsdInr);
    const fxHistoryStart = investmentsList.reduce<Date>((earliest, investment) => {
      const instrument = {
        kind: normalizeInvestmentKind(investment.investmentKind),
        code: '',
        stockMarket: getStockMarketFromInvestment(investment),
      };
      const date = startOfDay(investment.investmentDate);
      return needsUsdInr(instrument) && date.getTime() < earliest.getTime() ? date : earliest;
    }, startOfDay(now));
    const fxHistoryEnd = historyEndDate ?? now;
    const instrumentByKey = byKey(instruments);
    const rows = await loadInstrumentRows([
      ...instrumentByKey.keys(),
      ...(requiresUsdInrData ? [FX_KEY] : []),
    ]);
    const cachedRate = storedQuote(rows.get(FX_KEY))?.unitPriceInr ?? null;
    let networkFxHistory: Promise<PriceHistoryPoint[]> | null = null;
    const fxHistoryForFetch = () => {
      networkFxHistory ??= getUsdInrHistory({ startDate: fxHistoryStart, endDate: fxHistoryEnd });
      return networkFxHistory;
    };

    const [quotes, histories, nameByInstrumentKey] = await Promise.all([
      cachedQuotes(
        [
          ...liveInstruments.map((instrument) => ({
            key: instrumentKeyOf(instrument),
            ttlMs: quoteTtlMs(instrument, now),
          })),
          ...(requiresUsdInrData ? [{ key: FX_KEY, ttlMs: FX_TTL_MS }] : []),
        ],
        async (keys) => {
          const fetched = new Map<string, Quote>();
          let rate = cachedRate;
          if (keys.includes(FX_KEY)) {
            const latest = await getUsdInrRate();
            if (latest !== null) {
              rate = latest;
              fetched.set(FX_KEY, fxQuote(latest));
            }
          }
          const providerQuotes = await fromProviders<Quote>(
            keys.flatMap((key) => instrumentByKey.get(key) ?? []),
            (provider, group) =>
              provider.getLiveQuotes(group, { usdInrRate: rate, usdInrHistory: [] }),
          );
          for (const [key, quote] of providerQuotes) {
            fetched.set(key, quote);
          }
          return fetched;
        },
        rows,
      ),
      cachedHistories(
        [
          ...(historyStartDate === undefined || historyEndDate === undefined
            ? []
            : unitInstruments.map((instrument) => ({
                key: instrumentKeyOf(instrument),
                start: new Date(historyStartDate.getTime() - HISTORY_LOOKBACK_MS),
                end: historyEndDate,
              }))),
          ...(requiresUsdInrData
            ? [{ key: FX_KEY, start: fxHistoryStart, end: fxHistoryEnd }]
            : []),
        ],
        async (key, start, end) => {
          if (key === FX_KEY) {
            return getUsdInrHistory({ startDate: start, endDate: end });
          }
          const instrument = instrumentByKey.get(key);
          const provider =
            instrument === undefined
              ? null
              : investmentInstrumentProviderRegistry.getProvider(instrument);
          if (instrument === undefined || provider === null) {
            return [];
          }
          return provider.getHistoricalPrices(instrument, start, end, {
            usdInrRate: cachedRate,
            usdInrHistory: needsUsdInr(instrument) ? await fxHistoryForFetch() : [],
          });
        },
        rows,
      ),
      resolveInstrumentNames(instruments, rows),
    ]);

    const usdInrHistory = histories.get(FX_KEY) ?? [];
    const usdInrRate =
      quotes.get(FX_KEY)?.unitPriceInr ??
      getFxRateToInrFromHistory(fxHistoryEnd, usdInrHistory, null);
    quotes.delete(FX_KEY);
    histories.delete(FX_KEY);
    return {
      usdInrRate: requiresUsdInrData ? usdInrRate : null,
      usdInrHistory,
      quoteByInstrumentKey: quotes,
      nameByInstrumentKey,
      historyByInstrumentKey: histories,
    };
  },
);

const SAVED_HISTORY_DAYS = 10;

export const loadSavedMarketData = instrumentedFunction(
  'loadSavedMarketData',
  async (investmentsList: InvestmentRow[]): Promise<InvestmentMarketDataContext> => {
    const now = new Date();
    const instruments = getUniqueInstruments(investmentsList);
    const keys = instruments.map(instrumentKeyOf);
    const earliest = investmentsList.reduce<Date>((first, investment) => {
      const day = startOfDay(investment.investmentDate);
      return day.getTime() < first.getTime() ? day : first;
    }, startOfDay(now));
    const usesUsdInr = instruments.some(needsUsdInr);
    const [rows, histories, fxHistories] = await Promise.all([
      loadInstrumentRows([...keys, FX_KEY]),
      readStoredPrices(keys, new Date(now.getTime() - SAVED_HISTORY_DAYS * DAY_IN_MS)),
      usesUsdInr
        ? readStoredPrices([FX_KEY], earliest)
        : Promise.resolve(new Map<string, PriceHistoryPoint[]>()),
    ]);
    const quotes = new Map<string, Quote>();
    const names = new Map<string, string>();
    for (const key of keys) {
      const row = rows.get(key);
      const quote = storedQuote(row);
      if (quote !== null) {
        quotes.set(key, quote);
      }
      if (row?.name !== null && row?.name !== undefined) {
        names.set(key, row.name);
      }
    }
    const usdInrHistory = fxHistories.get(FX_KEY) ?? [];
    return {
      usdInrRate: usesUsdInr
        ? (storedQuote(rows.get(FX_KEY))?.unitPriceInr ??
          getFxRateToInrFromHistory(now, usdInrHistory, null))
        : null,
      usdInrHistory,
      quoteByInstrumentKey: quotes,
      nameByInstrumentKey: names,
      historyByInstrumentKey: histories,
    };
  },
);

export type UnitInstrumentOneDayMetrics = {
  currentUnitPriceInr: number | null;
  previousUnitPriceInr: number | null;
  currentUnitPriceNative: number | null;
  previousUnitPriceNative: number | null;
};

const getLatestPricePoint = (
  history: Array<{ date: Date; price: number }>,
  targetDate: Date,
  includeTargetDay: boolean,
): { date: Date; price: number } | null => {
  const targetTime = startOfDay(targetDate).getTime();
  let latestPoint: { date: Date; price: number } | null = null;
  let latestTime = Number.MIN_SAFE_INTEGER;

  for (const point of history) {
    const pointDayTime = startOfDay(point.date).getTime();
    const afterCutoff = includeTargetDay ? pointDayTime > targetTime : pointDayTime >= targetTime;
    if (afterCutoff || point.price <= 0 || !Number.isFinite(point.price)) {
      continue;
    }
    if (pointDayTime >= latestTime) {
      latestTime = pointDayTime;
      latestPoint = point;
    }
  }

  return latestPoint;
};

export const getUnitInstrumentOneDayMetricsByKey = ({
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
    const key = createInstrumentKey(instrument.kind, instrument.code, instrument.stockMarket);
    const history = marketDataContext.historyByInstrumentKey.get(key) ?? [];
    const quote = marketDataContext.quoteByInstrumentKey.get(key);
    const quoteAsOfDate =
      quote?.asOf === null || quote?.asOf === undefined ? null : startOfDay(quote.asOf);
    const currentPointFromHistory = getLatestPricePoint(history, quoteAsOfDate ?? asOfDate, true);
    const currentReferenceDate =
      quoteAsOfDate ?? startOfDay(currentPointFromHistory?.date ?? asOfDate);
    const previousPointFromHistory = getLatestPricePoint(history, currentReferenceDate, false);
    const isUsStock =
      instrument.kind === 'stocks' && normalizeStockMarket(instrument.stockMarket) === 'US';
    const currentUnitPriceInr = quote?.unitPriceInr ?? currentPointFromHistory?.price ?? null;
    const quotedPreviousClose = isUsStock ? null : (quote?.previousCloseInr ?? null);
    const previousUnitPriceInr =
      quotedPreviousClose !== null && quotedPreviousClose > 0
        ? quotedPreviousClose
        : (previousPointFromHistory?.price ?? null);

    const currentUnitPriceNative = (() => {
      if (!isUsStock) {
        return currentUnitPriceInr;
      }
      if (quote?.unitPriceNative !== undefined) {
        return quote.unitPriceNative;
      }
      if (currentPointFromHistory === null) {
        return null;
      }
      const fxRate = getFxRateToInrFromHistory(
        currentPointFromHistory.date,
        marketDataContext.usdInrHistory,
        marketDataContext.usdInrRate,
      );
      if (fxRate === null || fxRate <= 0) {
        return null;
      }
      return currentPointFromHistory.price / fxRate;
    })();

    const previousUnitPriceNative = (() => {
      if (!isUsStock) {
        return previousUnitPriceInr;
      }
      if (previousPointFromHistory === null) {
        return null;
      }
      const fxRate = getFxRateToInrFromHistory(
        previousPointFromHistory.date,
        marketDataContext.usdInrHistory,
        marketDataContext.usdInrRate,
      );
      if (fxRate === null || fxRate <= 0) {
        return null;
      }
      return previousPointFromHistory.price / fxRate;
    })();

    metricsByInstrumentKey.set(key, {
      currentUnitPriceInr,
      previousUnitPriceInr,
      currentUnitPriceNative,
      previousUnitPriceNative,
    });
  }

  return metricsByInstrumentKey;
};
