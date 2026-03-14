import { instrumentedFunction } from '@/lib/instrumentation';
import {
  isLivePriceInvestment,
  isUnitBasedInvestment,
  normalizeInvestmentKind,
  normalizeStockMarket,
  type InvestmentKindValue,
  type StockMarketValue,
} from '@/lib/investments';

import { getUsdInrHistory, getUsdInrRate } from './fx';
import { investmentInstrumentProviderRegistry } from './registry';
import { createInstrumentKey, getFxRateToInrFromHistory, startOfDay } from './shared';
import { getStockMarketFromInvestment } from './utils';

import type { InvestmentMarketDataContext } from './models';
import type {
  InstrumentIdentity,
  InvestmentInstrumentSearchResult,
  InvestmentRow,
  PriceHistoryPoint,
  Quote,
} from './types';

const resolveInstrumentNames = async (
  instruments: InstrumentIdentity[],
): Promise<Map<string, string>> => {
  const resolved = new Map<string, string>();
  const providerGroups =
    investmentInstrumentProviderRegistry.groupInstrumentsByProvider(instruments);
  const providerResults = await Promise.all(
    [...providerGroups.entries()].map(async ([provider, providerInstruments]) => {
      return provider.resolveNames(providerInstruments);
    }),
  );

  for (const providerResult of providerResults) {
    for (const [key, value] of providerResult.entries()) {
      resolved.set(key, value);
    }
  }

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

export const getHistoricalUnitPrices = async (
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
  return provider.getHistoricalPrices(
    {
      kind,
      code,
      stockMarket: effectiveStockMarket,
    },
    startDate,
    endDate,
    {
      usdInrRate: options?.usdInrRate ?? null,
      usdInrHistory: options?.usdInrHistory ?? [],
    },
  );
};

const getUniqueInstruments = (investmentsList: InvestmentRow[]): InstrumentIdentity[] => {
  const instrumentMap = new Map<string, InstrumentIdentity>();
  for (const investment of investmentsList) {
    const kind = normalizeInvestmentKind(investment.investmentKind);
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

const getLiveQuotesByInstrument = async (
  investmentsList: InvestmentRow[],
  usdInrRate: number | null,
): Promise<Map<string, Quote>> => {
  const openLiveInstruments = getUniqueInstruments(
    investmentsList.filter((investment) => {
      const kind = normalizeInvestmentKind(investment.investmentKind);
      return !investment.isClosed && isLivePriceInvestment(kind);
    }),
  );
  const quoteByInstrumentKey = new Map<string, Quote>();
  const providerGroups =
    investmentInstrumentProviderRegistry.groupInstrumentsByProvider(openLiveInstruments);
  const providerResults = await Promise.all(
    [...providerGroups.entries()].map(async ([provider, providerInstruments]) => {
      return provider.getLiveQuotes(providerInstruments, {
        usdInrRate,
        usdInrHistory: [],
      });
    }),
  );

  for (const providerResult of providerResults) {
    for (const [key, quote] of providerResult.entries()) {
      quoteByInstrumentKey.set(key, quote);
    }
  }

  return quoteByInstrumentKey;
};

const prefetchHistoricalPrices = async ({
  instruments,
  startDate,
  endDate,
  usdInrRate,
  usdInrHistory,
}: {
  instruments: InstrumentIdentity[];
  startDate: Date;
  endDate: Date;
  usdInrRate: number | null;
  usdInrHistory: Array<{ date: Date; price: number }>;
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
        {
          stockMarket: instrument.stockMarket,
          usdInrRate,
          usdInrHistory,
        },
      );
      historyByInstrumentKey.set(
        createInstrumentKey(instrument.kind, instrument.code, instrument.stockMarket),
        history,
      );
    }),
  );
  return historyByInstrumentKey;
};

export const buildInvestmentMarketDataContext = instrumentedFunction(
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
    const requiresUsdInrData = instruments.some(
      (instrument) =>
        (instrument.kind === 'stocks' && normalizeStockMarket(instrument.stockMarket) === 'US') ||
        instrument.kind === 'commodities',
    );
    const earliestInvestmentDate = investmentsList.reduce<Date | null>((earliest, investment) => {
      const kind = normalizeInvestmentKind(investment.investmentKind);
      const stockMarket = getStockMarketFromInvestment(investment);
      const needsUsdInrData = (kind === 'stocks' && stockMarket === 'US') || kind === 'commodities';
      if (!needsUsdInrData) {
        return earliest;
      }
      const date = startOfDay(investment.investmentDate);
      if (earliest === null || date.getTime() < earliest.getTime()) {
        return date;
      }
      return earliest;
    }, null);
    const usdInrHistoryEndDate = historyEndDate ?? new Date();
    const [usdInrRateRaw, usdInrHistory] = requiresUsdInrData
      ? await Promise.all([
          getUsdInrRate(),
          getUsdInrHistory({
            startDate: earliestInvestmentDate ?? startOfDay(new Date()),
            endDate: usdInrHistoryEndDate,
          }),
        ])
      : [null, []];
    const usdInrRate =
      usdInrRateRaw ?? getFxRateToInrFromHistory(usdInrHistoryEndDate, usdInrHistory, null);
    const [quoteByInstrumentKey, nameByInstrumentKey, historyByInstrumentKey] = await Promise.all([
      getLiveQuotesByInstrument(investmentsList, usdInrRate),
      resolveInstrumentNames(instruments),
      historyStartDate === undefined || historyEndDate === undefined
        ? Promise.resolve(new Map<string, Array<{ date: Date; price: number }>>())
        : prefetchHistoricalPrices({
            instruments,
            startDate: historyStartDate,
            endDate: historyEndDate,
            usdInrRate,
            usdInrHistory,
          }),
    ]);
    return {
      usdInrRate,
      usdInrHistory,
      quoteByInstrumentKey,
      nameByInstrumentKey,
      historyByInstrumentKey,
    };
  },
);

export type UnitInstrumentOneDayMetrics = {
  currentUnitPriceInr: number | null;
  previousUnitPriceInr: number | null;
  currentUnitPriceNative: number | null;
  previousUnitPriceNative: number | null;
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
    const currentPointFromHistory = getLatestPricePointOnOrBeforeDate(
      history,
      quoteAsOfDate ?? asOfDate,
    );
    const currentReferenceDate =
      quoteAsOfDate ?? startOfDay(currentPointFromHistory?.date ?? asOfDate);
    const previousPointFromHistory = getLatestPricePointBeforeDate(history, currentReferenceDate);
    const isUsStock =
      instrument.kind === 'stocks' && normalizeStockMarket(instrument.stockMarket) === 'US';
    const currentUnitPriceInr = quote?.unitPriceInr ?? currentPointFromHistory?.price ?? null;
    const previousUnitPriceInr = previousPointFromHistory?.price ?? null;

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
