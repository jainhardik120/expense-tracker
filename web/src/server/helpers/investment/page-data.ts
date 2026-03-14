import { instrumentedFunction } from '@/lib/instrumentation';
import type { InvestmentTimelineRangeValue } from '@/lib/investments';

import { enrichInvestments } from './enrichment';
import { buildInvestmentMarketDataContext } from './market-data';
import { getTimeRangeBounds } from './range';
import { startOfDay } from './shared';
import { buildInstrumentTimelineEntries, getInvestmentsDashboard } from './timeline';

import type { InvestmentsPageData, InvestmentsRangeTimelines } from './models';
import type { InvestmentRow } from './types';

export const buildInvestmentsPageData = instrumentedFunction(
  'buildInvestmentsPageData',
  async ({
    investmentsListRaw,
    page,
    perPage,
    endDate,
  }: {
    investmentsListRaw: InvestmentRow[];
    page: number;
    perPage: number;
    endDate?: Date;
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
    const dashboard = await getInvestmentsDashboard({
      investmentsList: enrichedAll,
      start: defaultRange.startDate,
      end: defaultRange.endDate,
      historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
      usdInrHistory: marketDataContext.usdInrHistory,
    });
    const instrumentTimelines = await buildInstrumentTimelineEntries({
      investmentsList: enrichedAll,
      startDate: defaultRange.startDate,
      endDate: defaultRange.endDate,
      historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
      usdInrHistory: marketDataContext.usdInrHistory,
    });

    return {
      table: {
        investments,
        pageCount,
        rowsCount,
      },
      dashboard,
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
  }: {
    investmentsListRaw: InvestmentRow[];
    range: InvestmentTimelineRangeValue;
    endDate?: Date;
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
    });
    const enrichedAll = await enrichInvestments({
      investmentsList: investmentsListRaw,
      marketDataContext,
      valuationDate: endDate,
    });
    const dashboard = await getInvestmentsDashboard({
      investmentsList: enrichedAll,
      start: rangeBounds.startDate,
      end: rangeBounds.endDate,
      historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
      usdInrHistory: marketDataContext.usdInrHistory,
    });
    const instrumentTimelines = await buildInstrumentTimelineEntries({
      investmentsList: enrichedAll,
      startDate: rangeBounds.startDate,
      endDate: rangeBounds.endDate,
      historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
      usdInrHistory: marketDataContext.usdInrHistory,
    });
    return {
      range,
      startDate: rangeBounds.startDate,
      endDate: rangeBounds.endDate,
      timeline: dashboard.timeline,
      instrumentTimelines,
    };
  },
);
