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

export const buildInvestmentsPageData = instrumentedFunction(
  'buildInvestmentsPageData',
  async ({
    investmentsListRaw,
    page,
    perPage,
    endDate,
    marketDataKinds,
  }: {
    investmentsListRaw: InvestmentRow[];
    page: number;
    perPage: number;
    endDate?: Date;
    marketDataKinds?: InvestmentKindValue[];
  }): Promise<InvestmentsPageData> => {
    const now = startOfDay(new Date());
    const earliestDate = investmentsListRaw.reduce<Date>((earliest, investment) => {
      const investmentDate = startOfDay(investment.investmentDate);
      return investmentDate.getTime() < earliest.getTime() ? investmentDate : earliest;
    }, now);
    const defaultRange = getTimeRangeBounds('1m', earliestDate, endDate);
    const marketDataContext = await buildInvestmentMarketDataContext({
      investmentsList: investmentsListRaw,
      historyStartDate: defaultRange.startDate,
      historyEndDate: defaultRange.endDate,
      marketDataKinds,
    });
    const enrichedAll = await enrichInvestments({
      investmentsList: investmentsListRaw,
      marketDataContext,
      valuationDate: endDate,
    });

    const rowsCount = enrichedAll.length;
    const pageCount = Math.max(1, Math.ceil(rowsCount / perPage));
    const offset = Math.max(page - 1, 0) * perPage;
    const investments = enrichedAll.slice(offset, offset + perPage);
    const [dashboard, categoryTimelines, instrumentTimelines] = await Promise.all([
      getInvestmentsDashboard({
        investmentsList: enrichedAll,
        start: defaultRange.startDate,
        end: defaultRange.endDate,
        historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
        usdInrHistory: marketDataContext.usdInrHistory,
      }),
      buildCategoryTimelineEntries({
        investmentsList: enrichedAll,
        startDate: defaultRange.startDate,
        endDate: defaultRange.endDate,
        historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
        usdInrHistory: marketDataContext.usdInrHistory,
      }),
      buildInstrumentTimelineEntries({
        investmentsList: enrichedAll,
        startDate: defaultRange.startDate,
        endDate: defaultRange.endDate,
        historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
        usdInrHistory: marketDataContext.usdInrHistory,
      }),
    ]);

    return {
      table: {
        investments,
        pageCount,
        rowsCount,
      },
      dashboard,
      categoryTimelines,
      instrumentTimelines,
      defaultRange: {
        range: '1m',
        startDate: defaultRange.startDate,
        endDate: defaultRange.endDate,
      },
    };
  },
);

export const buildInvestmentsRangeTimelines = instrumentedFunction(
  'buildInvestmentsRangeTimelines',
  async ({
    investmentsListRaw,
    range,
    endDate,
    marketDataKinds,
  }: {
    investmentsListRaw: InvestmentRow[];
    range: InvestmentTimelineRangeValue;
    endDate?: Date;
    marketDataKinds?: InvestmentKindValue[];
  }): Promise<InvestmentsRangeTimelines> => {
    const now = startOfDay(new Date());
    const earliestDate = investmentsListRaw.reduce<Date>((earliest, investment) => {
      const investmentDate = startOfDay(investment.investmentDate);
      return investmentDate.getTime() < earliest.getTime() ? investmentDate : earliest;
    }, now);
    const rangeBounds = getTimeRangeBounds(range, earliestDate, endDate);
    const marketDataContext = await buildInvestmentMarketDataContext({
      investmentsList: investmentsListRaw,
      historyStartDate: rangeBounds.startDate,
      historyEndDate: rangeBounds.endDate,
      marketDataKinds,
    });
    const enrichedAll = await enrichInvestments({
      investmentsList: investmentsListRaw,
      marketDataContext,
      valuationDate: endDate,
    });
    const [dashboard, categoryTimelines, instrumentTimelines] = await Promise.all([
      getInvestmentsDashboard({
        investmentsList: enrichedAll,
        start: rangeBounds.startDate,
        end: rangeBounds.endDate,
        historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
        usdInrHistory: marketDataContext.usdInrHistory,
      }),
      buildCategoryTimelineEntries({
        investmentsList: enrichedAll,
        startDate: rangeBounds.startDate,
        endDate: rangeBounds.endDate,
        historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
        usdInrHistory: marketDataContext.usdInrHistory,
      }),
      buildInstrumentTimelineEntries({
        investmentsList: enrichedAll,
        startDate: rangeBounds.startDate,
        endDate: rangeBounds.endDate,
        historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
        usdInrHistory: marketDataContext.usdInrHistory,
      }),
    ]);
    return {
      range,
      startDate: rangeBounds.startDate,
      endDate: rangeBounds.endDate,
      timeline: dashboard.timeline,
      categoryTimelines,
      instrumentTimelines,
    };
  },
);
