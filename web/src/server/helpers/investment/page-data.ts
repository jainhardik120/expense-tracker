import { instrumentedFunction } from '@/lib/instrumentation';
import {
  compareInvestmentCategories,
  getInvestmentCategory,
  type InvestmentCategoryValue,
  type InvestmentKindValue,
  type InvestmentTimelineRangeValue,
} from '@/lib/investments';

import { enrichInvestments } from './enrichment';
import { buildInvestmentMarketDataContext } from './market-data';
import { getTimeRangeBounds } from './range';
import { getFxRateToInrFromHistory, startOfDay } from './shared';
import { buildInstrumentTimelineEntries, getInvestmentsDashboard } from './timeline';
import { parseOptionalNumber } from './utils';

import type {
  CategoryTimelineEntry,
  EnrichedInvestment,
  InvestmentsPageData,
  InvestmentsRangeTimelines,
} from './models';
import type { InvestmentRow } from './types';

const buildCategoryTimelineEntries = async ({
  investmentsList,
  startDate,
  endDate,
  historyByInstrumentKey,
  usdInrHistory,
}: {
  investmentsList: EnrichedInvestment[];
  startDate: Date;
  endDate: Date;
  historyByInstrumentKey: Map<string, Array<{ date: Date; price: number }>>;
  usdInrHistory: Array<{ date: Date; price: number }>;
}): Promise<CategoryTimelineEntry[]> => {
  const investmentsByCategory = new Map<InvestmentCategoryValue, EnrichedInvestment[]>();
  for (const investment of investmentsList) {
    const category = getInvestmentCategory(investment.normalizedKind, investment.isRsuPosition);
    const categoryInvestments = investmentsByCategory.get(category) ?? [];
    categoryInvestments.push(investment);
    investmentsByCategory.set(category, categoryInvestments);
  }

  const entries = await Promise.all(
    [...investmentsByCategory.entries()].map(async ([category, categoryInvestments]) => {
      const dashboard = await getInvestmentsDashboard({
        investmentsList: categoryInvestments,
        start: startDate,
        end: endDate,
        historyByInstrumentKey,
        usdInrHistory,
        includeExcludedFromPortfolio: true,
      });
      return {
        category,
        timeline: dashboard.timeline,
      };
    }),
  );

  return entries.sort((left, right) => compareInvestmentCategories(left.category, right.category));
};

type RangeViewRequest = {
  investmentsListRaw: InvestmentRow[];
  range: InvestmentTimelineRangeValue;
  endDate?: Date;
  marketDataKinds: InvestmentKindValue[];
};

const buildRangeView = async ({
  investmentsListRaw,
  range,
  endDate,
  marketDataKinds,
}: RangeViewRequest) => {
  const now = startOfDay(new Date());
  const earliestDate = investmentsListRaw.reduce<Date>((earliest, investment) => {
    const investmentDate = startOfDay(investment.investmentDate);
    return investmentDate.getTime() < earliest.getTime() ? investmentDate : earliest;
  }, now);
  const { startDate, endDate: rangeEnd } = getTimeRangeBounds(range, earliestDate, endDate);
  const marketDataContext = await buildInvestmentMarketDataContext({
    investmentsList: investmentsListRaw,
    historyStartDate: startDate,
    historyEndDate: rangeEnd,
    marketDataKinds,
  });
  const enrichedAll = await enrichInvestments({
    investmentsList: investmentsListRaw,
    marketDataContext,
    valuationDate: endDate,
  });
  const history = {
    historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
    usdInrHistory: marketDataContext.usdInrHistory,
  };
  const [dashboard, categoryTimelines, instrumentTimelines] = await Promise.all([
    getInvestmentsDashboard({
      investmentsList: enrichedAll,
      start: startDate,
      end: rangeEnd,
      ...history,
    }),
    buildCategoryTimelineEntries({
      investmentsList: enrichedAll,
      startDate,
      endDate: rangeEnd,
      ...history,
    }),
    buildInstrumentTimelineEntries({
      investmentsList: enrichedAll,
      startDate,
      endDate: rangeEnd,
      ...history,
    }),
  ]);
  return {
    enrichedAll,
    usdInrHistory: history.usdInrHistory,
    startDate,
    endDate: rangeEnd,
    dashboard,
    categoryTimelines,
    instrumentTimelines,
  };
};

export const buildInvestmentsPageData = instrumentedFunction(
  'buildInvestmentsPageData',
  async ({
    investmentsListRaw,
    page,
    perPage,
    endDate,
    marketDataKinds,
  }: Omit<RangeViewRequest, 'range'> & {
    page: number;
    perPage: number;
  }): Promise<InvestmentsPageData> => {
    const view = await buildRangeView({
      investmentsListRaw,
      range: '1m',
      endDate,
      marketDataKinds,
    });
    const rowsCount = view.enrichedAll.length;
    const offset = Math.max(page - 1, 0) * perPage;
    return {
      table: {
        investments: view.enrichedAll.slice(offset, offset + perPage),
        pageCount: Math.max(1, Math.ceil(rowsCount / perPage)),
        rowsCount,
      },
      dashboard: view.dashboard,
      categoryTimelines: view.categoryTimelines,
      instrumentTimelines: view.instrumentTimelines,
      defaultRange: { range: '1m', startDate: view.startDate, endDate: view.endDate },
    };
  },
);

export const buildInvestmentsRangeTimelines = instrumentedFunction(
  'buildInvestmentsRangeTimelines',
  async (request: RangeViewRequest): Promise<InvestmentsRangeTimelines> => {
    const view = await buildRangeView(request);
    return {
      range: request.range,
      startDate: view.startDate,
      endDate: view.endDate,
      timeline: view.dashboard.timeline,
      categoryTimelines: view.categoryTimelines,
      instrumentTimelines: view.instrumentTimelines,
    };
  },
);

type InstrumentChartPoint = {
  date: Date;
  unitPrice: number;
  holdingValue: number;
  investedAmount: number;
};

type InstrumentChartPosition = {
  id: string;
  date: Date;
  units: number | null;
  investedAmount: number;
  valuationAmount: number;
  isClosed: boolean;
  closedAt: Date | null;
};

export type InstrumentChart = {
  points: InstrumentChartPoint[];
  positions: InstrumentChartPosition[];
};

export const buildInstrumentChart = instrumentedFunction(
  'buildInstrumentChart',
  async ({
    investmentsListRaw,
    range,
    marketDataKinds,
  }: Omit<RangeViewRequest, 'endDate'>): Promise<InstrumentChart> => {
    if (investmentsListRaw.length === 0) {
      return { points: [], positions: [] };
    }
    const view = await buildRangeView({ investmentsListRaw, range, marketDataKinds });
    const points = view.instrumentTimelines[0]?.timeline.points ?? [];
    const isUsd = view.enrichedAll.some((position) => position.displayCurrency === 'USD');
    const fallbackFx =
      view.enrichedAll.find((position) => position.currentFxRateToInr !== null)
        ?.currentFxRateToInr ?? null;
    const series = points.map((point) => {
      const day = startOfDay(point.date).getTime();
      const fx = isUsd
        ? (getFxRateToInrFromHistory(point.date, view.usdInrHistory, fallbackFx) ?? 1)
        : 1;
      const investedAmount = view.enrichedAll.reduce((total, position) => {
        const opened = startOfDay(position.investmentDate).getTime() <= day;
        const closed = position.closedAt !== null && startOfDay(position.closedAt).getTime() <= day;
        return opened && !closed ? total + position.investedAmountInr : total;
      }, 0);
      return {
        date: point.date,
        unitPrice: point.unitPrice * fx,
        holdingValue: point.holdingValue * fx,
        investedAmount,
      };
    });
    const positions = view.enrichedAll
      .map((position) => ({
        id: position.id,
        date: position.investmentDate,
        units: parseOptionalNumber(position.units),
        investedAmount: position.investedAmountInr,
        valuationAmount: position.valuationAmount ?? position.investedAmountInr,
        isClosed: position.isClosedPosition,
        closedAt: position.closedAt,
      }))
      .sort((left, right) => right.date.getTime() - left.date.getTime());
    return { points: series, positions };
  },
);
