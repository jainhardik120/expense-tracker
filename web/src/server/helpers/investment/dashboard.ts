import { instrumentedFunction } from '@/lib/instrumentation';
import {
  compareInvestmentCategories,
  getAssetClass,
  getInvestmentCategory,
  isUnitBasedInvestment,
  type AssetClassTagValue,
  type InvestmentCategoryValue,
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
import { computeXirr, investmentCashFlows, type CashFlow } from './xirr';

import type {
  AssetAllocationEntry,
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
  assetClass: AssetClassTagValue | null;
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
  realizedPnl: number;
  flows: CashFlow[];
};

type BreakdownAggregate = {
  investedAmount: number;
  valuationAmount: number;
  realizedPnl: number;
  dayChange: number;
  openPositions: number;
  closedPositions: number;
  totalPositions: number;
  flows: CashFlow[];
};

const summarizeBreakdown = (summary: BreakdownAggregate) => ({
  investedAmount: summary.investedAmount,
  valuationAmount: summary.valuationAmount,
  pnl: summary.valuationAmount - summary.investedAmount,
  pnlPercentage: getPercentageChange(
    summary.valuationAmount - summary.investedAmount,
    summary.investedAmount,
  ),
  realizedPnl: summary.realizedPnl,
  dayChange: summary.dayChange,
  dayChangePercentage: getDayChangePercentageFromValuation(
    summary.valuationAmount,
    summary.dayChange,
  ),
  xirr: computeXirr(summary.flows),
  openPositions: summary.openPositions,
  closedPositions: summary.closedPositions,
  totalPositions: summary.totalPositions,
});

const addInvestmentToBreakdown = <TKey extends string>(
  map: Map<TKey, BreakdownAggregate>,
  key: TKey,
  investment: EnrichedInvestment,
  asOf: Date,
) => {
  const investedAmount = investment.investedAmountInr;
  const valuationAmount = investment.valuationAmount ?? investedAmount;
  const summary = map.get(key) ?? {
    investedAmount: 0,
    valuationAmount: 0,
    realizedPnl: 0,
    dayChange: 0,
    openPositions: 0,
    closedPositions: 0,
    totalPositions: 0,
    flows: [],
  };
  if (investment.isClosedPosition) {
    summary.realizedPnl += valuationAmount - investedAmount;
  } else {
    summary.flows.push(...investmentCashFlows(investment, asOf));
    summary.investedAmount += investedAmount;
    summary.valuationAmount += valuationAmount;
  }
  summary.dayChange += investment.dayChange ?? 0;
  summary.totalPositions += 1;
  if (investment.isClosedPosition) {
    summary.closedPositions += 1;
  } else {
    summary.openPositions += 1;
  }
  map.set(key, summary);
};

const buildAssetAllocation = (investmentsList: EnrichedInvestment[]): AssetAllocationEntry[] => {
  const entries = new Map<string, AssetAllocationEntry>();
  for (const investment of investmentsList) {
    if (investment.isClosedPosition) {
      continue;
    }
    const assetClass = getAssetClass(
      investment.normalizedKind,
      investment.instrumentCode,
      investment.assetClass,
    );
    const key = `${investment.normalizedKind}:${assetClass}`;
    const entry = entries.get(key) ?? {
      kind: investment.normalizedKind,
      assetClass,
      investedAmount: 0,
      valuationAmount: 0,
    };
    entry.investedAmount += investment.investedAmountInr;
    entry.valuationAmount += investment.valuationAmount ?? investment.investedAmountInr;
    entries.set(key, entry);
  }
  return [...entries.values()];
};

const buildInstrumentBreakdown = (
  investmentsList: EnrichedInvestment[],
  asOf: Date,
): DashboardInstrumentBreakdown[] => {
  const aggregates = new Map<string, InstrumentAggregate>();
  const instrumentKey = (investment: EnrichedInvestment, code: string) =>
    `${createInstrumentKey(
      investment.normalizedKind,
      code,
      investment.normalizedStockMarket,
    )}|${investment.isRsuPosition ? 'RSU' : 'REG'}`;
  const keysWithOpenPositions = new Set(
    investmentsList
      .filter((investment) => !investment.isClosedPosition)
      .map((investment) => instrumentKey(investment, investment.instrumentCode?.trim() ?? '')),
  );

  for (const investment of investmentsList) {
    const code = investment.instrumentCode?.trim() ?? '';
    if (code === '') {
      continue;
    }
    const key = instrumentKey(investment, code);
    const countsTowardsHolding = !investment.isClosedPosition || !keysWithOpenPositions.has(key);
    const investedAmount = investment.investedAmountInr;
    const valuationAmount = investment.valuationAmount ?? investedAmount;
    const dayChange = investment.dayChange ?? 0;
    const units = getUnitsForInvestment(investment);

    const aggregate = aggregates.get(key) ?? {
      kind: investment.normalizedKind,
      code,
      stockMarket: investment.normalizedStockMarket,
      name: investment.instrumentName ?? code,
      assetClass: investment.assetClass ?? null,
      displayCurrency: investment.displayCurrency,
      isRsu: investment.isRsuPosition,
      isExcludedFromPortfolio: investment.isExcludedFromPortfolioPosition,
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
      realizedPnl: 0,
      flows: [],
    };

    if (countsTowardsHolding) {
      aggregate.flows.push(...investmentCashFlows(investment, asOf));
    }
    if (investment.isClosedPosition) {
      aggregate.realizedPnl += valuationAmount - investedAmount;
    }

    aggregate.positionsCount += 1;
    if (investment.isClosedPosition) {
      aggregate.closedPositions += 1;
    } else {
      aggregate.openPositions += 1;
      aggregate.units += units;
    }
    if (countsTowardsHolding) {
      aggregate.investedAmount += investedAmount;
      aggregate.investedAmountDisplay += investment.investedAmountDisplay;
      aggregate.buyValueInrAtPurchaseFx += investment.investedAmountInr;
      aggregate.buyValueInrAtCurrentFx += investment.investedAmountInrAtCurrentFx ?? investedAmount;
      aggregate.valuationAmount += valuationAmount;
      aggregate.valuationAmountDisplay +=
        investment.valuationAmountDisplay ?? investment.investedAmountDisplay;
      aggregate.currentValueInrAtCurrentFx +=
        investment.currentValueInrAtCurrentFx ?? valuationAmount;
    }
    aggregate.dayChange += dayChange;
    aggregate.dayChangeDisplay += investment.dayChangeDisplay ?? dayChange;
    aggregate.isRsu = aggregate.isRsu || investment.isRsuPosition;
    aggregate.isExcludedFromPortfolio =
      aggregate.isExcludedFromPortfolio || investment.isExcludedFromPortfolioPosition;
    if (units > 0 && countsTowardsHolding) {
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
        assetClass: aggregate.assetClass,
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
        xirr: computeXirr(aggregate.flows),
        realizedPnl: aggregate.realizedPnl,
        investedAmountInr: aggregate.investedAmount,
        valuationAmountInr: aggregate.valuationAmount,
        dayChangeInr: aggregate.dayChange,
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
    .sort((left, right) => {
      const categoryComparison = compareInvestmentCategories(
        getInvestmentCategory(left.kind, left.isRsu),
        getInvestmentCategory(right.kind, right.isRsu),
      );
      return categoryComparison === 0 ? left.name.localeCompare(right.name) : categoryComparison;
    });
};

export const getInvestmentsDashboard = instrumentedFunction(
  'getInvestmentsDashboard',
  async ({
    investmentsList,
    start,
    end,
    historyByInstrumentKey,
    usdInrHistory,
    includeExcludedFromPortfolio = false,
  }: {
    investmentsList: EnrichedInvestment[];
    start?: Date;
    end?: Date;
    historyByInstrumentKey?: Map<string, Array<{ date: Date; price: number }>>;
    usdInrHistory?: Array<{ date: Date; price: number }>;
    includeExcludedFromPortfolio?: boolean;
  }): Promise<InvestmentsDashboard> => {
    const kindMap = new Map<InvestmentKindValue, BreakdownAggregate>();
    const categoryMap = new Map<InvestmentCategoryValue, BreakdownAggregate>();
    const portfolioInvestments = includeExcludedFromPortfolio
      ? investmentsList
      : investmentsList.filter((investment) => !investment.isExcludedFromPortfolioPosition);
    const asOf = end ?? new Date();
    const instrumentBreakdown = buildInstrumentBreakdown(investmentsList, asOf);
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
    let totalRealizedPnl = 0;
    let totalDayChange = 0;
    let openPositions = 0;
    let closedPositions = 0;
    const portfolioFlows: CashFlow[] = [];

    for (const investment of investmentsList) {
      addInvestmentToBreakdown(
        categoryMap,
        getInvestmentCategory(investment.normalizedKind, investment.isRsuPosition),
        investment,
        asOf,
      );
    }

    for (const investment of portfolioInvestments) {
      const investedAmount = investment.investedAmountInr;
      const valuationAmount = investment.valuationAmount ?? investedAmount;
      const dayChange = investment.dayChange ?? 0;
      if (investment.isClosedPosition) {
        totalRealizedPnl += valuationAmount - investedAmount;
      } else {
        totalInvestedAmount += investedAmount;
        totalValuationAmount += valuationAmount;
      }
      totalDayChange += dayChange;
      if (!investment.isClosedPosition) {
        portfolioFlows.push(...investmentCashFlows(investment, asOf));
      }

      if (investment.isClosedPosition) {
        closedPositions += 1;
      } else {
        openPositions += 1;
      }

      addInvestmentToBreakdown(kindMap, investment.normalizedKind, investment, asOf);
    }

    const kindBreakdown = [...kindMap.entries()]
      .map(([kind, summary]) => ({ kind, ...summarizeBreakdown(summary) }))
      .sort((left, right) => right.valuationAmount - left.valuationAmount);

    const categoryBreakdown = [...categoryMap.entries()]
      .map(([category, summary]) => ({ category, ...summarizeBreakdown(summary) }))
      .sort((left, right) => compareInvestmentCategories(left.category, right.category));

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
        realizedPnl: totalRealizedPnl,
        dayChange: totalDayChange,
        dayChangePercentage: getDayChangePercentageFromValuation(
          totalValuationAmount,
          totalDayChange,
        ),
        xirr: computeXirr(portfolioFlows),
        openPositions,
        closedPositions,
        totalPositions: openPositions + closedPositions,
      },
      kindBreakdown,
      categoryBreakdown,
      assetAllocation: buildAssetAllocation(portfolioInvestments),
      timeline,
      instrumentOptions,
      instrumentBreakdown,
    };
  },
);
