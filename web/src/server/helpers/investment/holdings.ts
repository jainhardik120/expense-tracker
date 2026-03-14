import { instrumentedFunction } from '@/lib/instrumentation';
import {
  isUnitBasedInvestment,
  normalizeStockMarket,
  type InvestmentKindValue,
  type StockMarketValue,
} from '@/lib/investments';

import { getFdValuationAtDate } from './fd';
import { getHistoricalUnitPrices } from './market-data';
import { buildDailyPriceSeries, buildDailyRange, clampDateInRange } from './range';
import { createInstrumentKey, getFxRateToInrFromHistory, startOfDay } from './shared';
import { dateToDayKey, deriveUnits, parseOptionalNumber } from './utils';

import type {
  EnrichedInvestment,
  InstrumentHoldingTimeline,
  InstrumentHoldingTimelinePoint,
  InstrumentTimelineEntry,
} from './models';

const getUnitsForInvestment = (investment: EnrichedInvestment): number => {
  return deriveUnits({ units: investment.units }) ?? 0;
};

const getFallbackUnitPrice = (investment: EnrichedInvestment): number | undefined => {
  const units = getUnitsForInvestment(investment);
  const investedAmount = investment.investedAmountInr;
  if (units > 0 && investedAmount > 0) {
    return investedAmount / units;
  }
  return undefined;
};

export const getDailyRangeFromInvestments = ({
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

export const buildDailyInstrumentTimeline = async ({
  kind,
  code,
  stockMarket,
  positions,
  startDate,
  endDate,
  historyByInstrumentKey,
  usdInrHistory,
}: {
  kind: InvestmentKindValue;
  code: string;
  stockMarket: StockMarketValue | null;
  positions: EnrichedInvestment[];
  startDate: Date;
  endDate: Date;
  historyByInstrumentKey?: Map<string, Array<{ date: Date; price: number }>>;
  usdInrHistory?: Array<{ date: Date; price: number }>;
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
  const usdInrRateFallback =
    positions
      .map((position) => position.liveFxRateToInr)
      .find((value): value is number => value !== null && value > 0) ?? null;

  const rawPrices =
    historyByInstrumentKey?.get(createInstrumentKey(kind, code, stockMarket)) ??
    (await getHistoricalUnitPrices(kind, code, startDate, endDate, {
      stockMarket,
      usdInrRate: usdInrRateFallback,
      usdInrHistory: usdInrHistory ?? [],
    }));
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

const getInstrumentHoldingTimeline = instrumentedFunction(
  'getInstrumentHoldingTimeline',
  async ({
    kind,
    code,
    stockMarket,
    investmentsList,
    start,
    end,
    historyByInstrumentKey,
    usdInrHistory,
  }: {
    kind: InvestmentKindValue;
    code: string;
    stockMarket: StockMarketValue | null;
    investmentsList: EnrichedInvestment[];
    start?: Date;
    end?: Date;
    historyByInstrumentKey?: Map<string, Array<{ date: Date; price: number }>>;
    usdInrHistory?: Array<{ date: Date; price: number }>;
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
      stockMarket,
      positions: investmentsList,
      startDate,
      endDate,
      historyByInstrumentKey,
      usdInrHistory,
    });
    const isUsStock = kind === 'stocks' && normalizeStockMarket(stockMarket) === 'US';
    const pointsInDisplayCurrency = isUsStock
      ? points.map((point) => {
          const fxRate = getFxRateToInrFromHistory(
            point.date,
            usdInrHistory ?? [],
            investmentsList.find((investment) => investment.currentFxRateToInr !== null)
              ?.currentFxRateToInr ?? null,
          );
          if (fxRate === null || fxRate <= 0) {
            return point;
          }
          return {
            ...point,
            unitPrice: point.unitPrice / fxRate,
            holdingValue: point.holdingValue / fxRate,
          };
        })
      : points;

    const investedAmount = investmentsList.reduce((acc, investment) => {
      return acc + (isUsStock ? investment.investedAmountDisplay : investment.investedAmountInr);
    }, 0);
    const latestPoint = pointsInDisplayCurrency.at(-1);
    const latestHoldingValue = latestPoint?.holdingValue ?? 0;

    return {
      points: pointsInDisplayCurrency,
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
    {
      kind: InvestmentKindValue;
      code: string;
      stockMarket: StockMarketValue | null;
      positions: EnrichedInvestment[];
    }
  >();
  for (const investment of investmentsList) {
    const code = investment.instrumentCode?.trim() ?? '';
    if (code === '') {
      continue;
    }
    const key = createInstrumentKey(
      investment.normalizedKind,
      code,
      investment.normalizedStockMarket,
    );
    const group = groups.get(key) ?? {
      kind: investment.normalizedKind,
      code,
      stockMarket: investment.normalizedStockMarket,
      positions: [],
    };
    group.positions.push(investment);
    groups.set(key, group);
  }
  return [...groups.values()];
};

export const buildInstrumentTimelineEntries = instrumentedFunction(
  'buildInstrumentTimelineEntries',
  async ({
    investmentsList,
    startDate,
    endDate,
    historyByInstrumentKey,
    usdInrHistory,
  }: {
    investmentsList: EnrichedInvestment[];
    startDate: Date;
    endDate: Date;
    historyByInstrumentKey?: Map<string, Array<{ date: Date; price: number }>>;
    usdInrHistory?: Array<{ date: Date; price: number }>;
  }): Promise<InstrumentTimelineEntry[]> => {
    const groups = buildInstrumentGroups(investmentsList);
    const entries = await Promise.all(
      groups.map(async (group) => ({
        kind: group.kind,
        code: group.code,
        stockMarket: group.stockMarket,
        timeline: await getInstrumentHoldingTimeline({
          kind: group.kind,
          code: group.code,
          stockMarket: group.stockMarket,
          investmentsList: group.positions,
          start: startDate,
          end: endDate,
          historyByInstrumentKey,
          usdInrHistory,
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
