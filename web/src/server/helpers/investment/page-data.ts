import { subDays } from 'date-fns';

import { instrumentedFunction } from '@/lib/instrumentation';
import { type InvestmentKindValue, type InvestmentTimelineRangeValue } from '@/lib/investments';

import { summarizeInvestments } from './dashboard';
import { enrichInvestments } from './enrichment';
import { buildInvestmentMarketDataContext, loadSavedMarketData } from './market-data';
import { getTimeRangeBounds } from './range';
import { getFxRateToInrFromHistory, startOfDay } from './shared';
import { buildInstrumentTimelineEntries } from './timeline';
import { parseOptionalNumber } from './utils';

import type { EnrichedInvestment, InvestmentMarketDataContext } from './models';
import type { InvestmentRow } from './types';

const LIVE_HISTORY_DAYS = 10;

const toPortfolioView = async (
  investmentsList: InvestmentRow[],
  marketDataContext: InvestmentMarketDataContext,
  endDate: Date | undefined,
) => {
  const positions = await enrichInvestments({
    investmentsList,
    marketDataContext,
    valuationDate: endDate,
  });
  return { positions, dashboard: summarizeInvestments(positions, endDate ?? new Date()) };
};

export const buildSavedPortfolio = instrumentedFunction(
  'buildSavedPortfolio',
  async (investmentsList: InvestmentRow[], endDate?: Date) =>
    toPortfolioView(investmentsList, await loadSavedMarketData(investmentsList), endDate),
);

export const buildLivePortfolio = instrumentedFunction(
  'buildLivePortfolio',
  async (investmentsList: InvestmentRow[], endDate?: Date) => {
    const now = new Date();
    return toPortfolioView(
      investmentsList,
      await buildInvestmentMarketDataContext({
        investmentsList,
        historyStartDate: subDays(now, LIVE_HISTORY_DAYS),
        historyEndDate: now,
      }),
      endDate,
    );
  },
);

type RangeViewRequest = {
  investmentsListRaw: InvestmentRow[];
  range: InvestmentTimelineRangeValue;
  marketDataKinds: InvestmentKindValue[];
};

const buildInstrumentView = async ({
  investmentsListRaw,
  range,
  marketDataKinds,
}: RangeViewRequest) => {
  const now = startOfDay(new Date());
  const earliestDate = investmentsListRaw.reduce<Date>((earliest, investment) => {
    const investmentDate = startOfDay(investment.investmentDate);
    return investmentDate.getTime() < earliest.getTime() ? investmentDate : earliest;
  }, now);
  const { startDate, endDate } = getTimeRangeBounds(range, earliestDate);
  const marketDataContext = await buildInvestmentMarketDataContext({
    investmentsList: investmentsListRaw,
    historyStartDate: startDate,
    historyEndDate: endDate,
    marketDataKinds,
  });
  const enrichedAll: EnrichedInvestment[] = await enrichInvestments({
    investmentsList: investmentsListRaw,
    marketDataContext,
  });
  return {
    enrichedAll,
    usdInrHistory: marketDataContext.usdInrHistory,
    instrumentTimelines: await buildInstrumentTimelineEntries({
      investmentsList: enrichedAll,
      startDate,
      endDate,
      historyByInstrumentKey: marketDataContext.historyByInstrumentKey,
      usdInrHistory: marketDataContext.usdInrHistory,
    }),
  };
};

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
  }: RangeViewRequest): Promise<InstrumentChart> => {
    if (investmentsListRaw.length === 0) {
      return { points: [], positions: [] };
    }
    const view = await buildInstrumentView({ investmentsListRaw, range, marketDataKinds });
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
