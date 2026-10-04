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
import { startOfDay } from './shared';
import { buildInstrumentTimelineEntries, getInvestmentsDashboard } from './timeline';

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
