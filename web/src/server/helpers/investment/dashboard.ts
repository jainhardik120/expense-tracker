import { instrumentedFunction } from '@/lib/instrumentation';
import {
  isUnitBasedInvestment,
  type InvestmentKindValue,
  type StockMarketValue,
} from '@/lib/investments';

import { getFdValuationAtDate } from './fd';
import { getDailyRangeFromInvestments, buildDailyInstrumentTimeline } from './holdings';
import { createInstrumentKey, startOfDay, USD_CURRENCY } from './shared';
import {
  dateToDayKey,
  deriveUnits,
  getDayChangePercentageFromValuation,
  getPercentageChange,
  parseOptionalNumber,
} from './utils';

import type {
  DashboardInstrumentBreakdown,
  DashboardInstrumentOption,
  EnrichedInvestment,
  InvestmentsDashboard,
} from './models';

const getUnitsForInvestment = (investment: EnrichedInvestment): number => {
  return deriveUnits({ units: investment.units }) ?? 0;
};

type InstrumentAggregate = {
  kind: InvestmentKindValue;
  code: string;
  stockMarket: StockMarketValue | null;
  name: string;
  displayCurrency: 'INR' | 'USD';
  isRsu: boolean;
  isExcludedFromPortfolio: boolean;
  positionsCount: number;
  openPositions: number;
  closedPositions: number;
  units: number;
  investedAmount: number;
  investedAmountDisplay: number;
  buyValueInrAtPurchaseFx: number;
  buyValueInrAtCurrentFx: number;
  valuationAmount: number;
  valuationAmountDisplay: number;
  dayChange: number;
  dayChangeDisplay: number;
  weightedBuyAmountDisplay: number;
  weightedBuyUnits: number;
  currentUnitPriceDisplay: number | null;
  currentValueInrAtCurrentFx: number;
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
    const key = createInstrumentKey(
      investment.normalizedKind,
      code,
      investment.normalizedStockMarket,
    );
    const investedAmount = investment.investedAmountInr;
    const valuationAmount = investment.valuationAmount ?? investedAmount;
    const dayChange = investment.dayChange ?? 0;
    const units = getUnitsForInvestment(investment);

    const aggregate = aggregates.get(key) ?? {
      kind: investment.normalizedKind,
      code,
      stockMarket: investment.normalizedStockMarket,
      name: investment.instrumentName ?? code,
      displayCurrency: investment.displayCurrency,
      isRsu: investment.isRsuPosition,
      isExcludedFromPortfolio: investment.isRsuPosition,
      positionsCount: 0,
      openPositions: 0,
      closedPositions: 0,
      units: 0,
      investedAmount: 0,
      investedAmountDisplay: 0,
      buyValueInrAtPurchaseFx: 0,
      buyValueInrAtCurrentFx: 0,
      valuationAmount: 0,
      valuationAmountDisplay: 0,
      dayChange: 0,
      dayChangeDisplay: 0,
      weightedBuyAmountDisplay: 0,
      weightedBuyUnits: 0,
      currentUnitPriceDisplay: null,
      currentValueInrAtCurrentFx: 0,
    };

    aggregate.positionsCount += 1;
    if (investment.isClosedPosition) {
      aggregate.closedPositions += 1;
    } else {
      aggregate.openPositions += 1;
      aggregate.units += units;
    }
    aggregate.investedAmount += investedAmount;
    aggregate.investedAmountDisplay += investment.investedAmountDisplay;
    aggregate.buyValueInrAtPurchaseFx += investment.investedAmountInr;
    aggregate.buyValueInrAtCurrentFx += investment.investedAmountInrAtCurrentFx ?? investedAmount;
    aggregate.valuationAmount += valuationAmount;
    aggregate.valuationAmountDisplay +=
      investment.valuationAmountDisplay ?? investment.investedAmountDisplay;
    aggregate.currentValueInrAtCurrentFx +=
      investment.currentValueInrAtCurrentFx ?? valuationAmount;
    aggregate.dayChange += dayChange;
    aggregate.dayChangeDisplay += investment.dayChangeDisplay ?? dayChange;
    aggregate.isRsu = aggregate.isRsu || investment.isRsuPosition;
    aggregate.isExcludedFromPortfolio =
      aggregate.isExcludedFromPortfolio || investment.isRsuPosition;
    if (units > 0) {
      aggregate.weightedBuyAmountDisplay += investment.investedAmountDisplay;
      aggregate.weightedBuyUnits += units;
    }
    if (!investment.isClosedPosition && investment.liveUnitPriceDisplay !== null) {
      aggregate.currentUnitPriceDisplay = investment.liveUnitPriceDisplay;
    }
    aggregates.set(key, aggregate);
  }

  return [...aggregates.values()]
    .map((aggregate) => {
      const pnlDisplay = aggregate.valuationAmountDisplay - aggregate.investedAmountDisplay;
      return {
        kind: aggregate.kind,
        code: aggregate.code,
        stockMarket: aggregate.stockMarket,
        name: aggregate.name,
        displayCurrency: aggregate.displayCurrency,
        isRsu: aggregate.isRsu,
        isExcludedFromPortfolio: aggregate.isExcludedFromPortfolio,
        positionsCount: aggregate.positionsCount,
        openPositions: aggregate.openPositions,
        closedPositions: aggregate.closedPositions,
        totalPositions: aggregate.positionsCount,
        units: aggregate.units,
        investedAmount: aggregate.investedAmountDisplay,
        valuationAmount: aggregate.valuationAmountDisplay,
        pnl: pnlDisplay,
        pnlPercentage: getPercentageChange(pnlDisplay, aggregate.investedAmountDisplay),
        dayChange: aggregate.dayChangeDisplay,
        dayChangePercentage: getDayChangePercentageFromValuation(
          aggregate.valuationAmountDisplay,
          aggregate.dayChangeDisplay,
        ),
        averageBuyPrice:
          aggregate.weightedBuyUnits > 0
            ? aggregate.weightedBuyAmountDisplay / aggregate.weightedBuyUnits
            : null,
        currentUnitPrice:
          aggregate.currentUnitPriceDisplay ??
          (aggregate.units > 0 ? aggregate.valuationAmountDisplay / aggregate.units : null),
        buyValueInrAtPurchaseFx:
          aggregate.displayCurrency === USD_CURRENCY ? aggregate.buyValueInrAtPurchaseFx : null,
        currentValueInrAtCurrentFx:
          aggregate.displayCurrency === USD_CURRENCY ? aggregate.currentValueInrAtCurrentFx : null,
        buyFxRateToInr:
          aggregate.displayCurrency === USD_CURRENCY && aggregate.investedAmountDisplay > 0
            ? aggregate.buyValueInrAtPurchaseFx / aggregate.investedAmountDisplay
            : null,
        currentFxRateToInr:
          aggregate.displayCurrency === USD_CURRENCY && aggregate.valuationAmountDisplay > 0
            ? aggregate.currentValueInrAtCurrentFx / aggregate.valuationAmountDisplay
            : null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const getInvestmentsDashboard = instrumentedFunction(
  'getInvestmentsDashboard',
  async ({
    investmentsList,
    start,
    end,
    historyByInstrumentKey,
    usdInrHistory,
  }: {
    investmentsList: EnrichedInvestment[];
    start?: Date;
    end?: Date;
    historyByInstrumentKey?: Map<string, Array<{ date: Date; price: number }>>;
    usdInrHistory?: Array<{ date: Date; price: number }>;
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
    const portfolioInvestments = investmentsList.filter((investment) => !investment.isRsuPosition);
    const instrumentBreakdown = buildInstrumentBreakdown(investmentsList);
    const instrumentOptions: DashboardInstrumentOption[] = instrumentBreakdown.map((item) => ({
      kind: item.kind,
      code: item.code,
      stockMarket: item.stockMarket,
      name: item.name,
      displayCurrency: item.displayCurrency,
      isRsu: item.isRsu,
      isExcludedFromPortfolio: item.isExcludedFromPortfolio,
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

    for (const investment of portfolioInvestments) {
      const investedAmount = investment.investedAmountInr;
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
      investmentsList: portfolioInvestments,
      start,
      end,
    });

    const dailyValuation = new Map<string, number>();
    const investedEvents = new Map<string, number>();
    let baseInvestedAmount = 0;

    const unitBasedGroups = new Map<
      string,
      {
        kind: InvestmentKindValue;
        code: string;
        stockMarket: StockMarketValue | null;
        positions: EnrichedInvestment[];
      }
    >();
    const nonUnitPositions: EnrichedInvestment[] = [];

    for (const investment of portfolioInvestments) {
      const investedAmount = investment.investedAmountInr;
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
        const groupKey = createInstrumentKey(
          investment.normalizedKind,
          code,
          investment.normalizedStockMarket,
        );
        const group = unitBasedGroups.get(groupKey) ?? {
          kind: investment.normalizedKind,
          code,
          stockMarket: investment.normalizedStockMarket,
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
          stockMarket: group.stockMarket,
          positions: group.positions,
          startDate,
          endDate,
          historyByInstrumentKey,
          usdInrHistory,
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
