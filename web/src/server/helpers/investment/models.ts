import type {
  InvestmentKindValue,
  InvestmentTimelineRangeValue,
  StockMarketValue,
} from '@/lib/investments';

import type { InvestmentRow, PriceHistoryPoint, Quote } from './types';

export type DisplayCurrencyValue = 'INR' | 'USD';

export type InvestmentTimelinePoint = {
  date: Date;
  investedAmount: number;
  valuationAmount: number;
  pnl: number;
};

export type DashboardInstrumentOption = {
  kind: InvestmentKindValue;
  code: string;
  stockMarket: StockMarketValue | null;
  name: string;
  displayCurrency: DisplayCurrencyValue;
  isRsu: boolean;
  isExcludedFromPortfolio: boolean;
  positionsCount: number;
  units: number;
  investedAmount: number;
  valuationAmount: number;
  pnl: number;
  dayChange: number;
  dayChangePercentage: number | null;
};

export type DashboardInstrumentBreakdown = DashboardInstrumentOption & {
  openPositions: number;
  closedPositions: number;
  totalPositions: number;
  averageBuyPrice: number | null;
  currentUnitPrice: number | null;
  pnlPercentage: number | null;
  buyValueInrAtPurchaseFx: number | null;
  currentValueInrAtCurrentFx: number | null;
  buyFxRateToInr: number | null;
  currentFxRateToInr: number | null;
};

export type InvestmentsDashboard = {
  summary: {
    investedAmount: number;
    valuationAmount: number;
    pnl: number;
    pnlPercentage: number | null;
    dayChange: number;
    dayChangePercentage: number | null;
    openPositions: number;
    closedPositions: number;
    totalPositions: number;
  };
  kindBreakdown: Array<{
    kind: InvestmentKindValue;
    investedAmount: number;
    valuationAmount: number;
    pnl: number;
    pnlPercentage: number | null;
    dayChange: number;
    dayChangePercentage: number | null;
    openPositions: number;
    closedPositions: number;
    totalPositions: number;
  }>;
  timeline: InvestmentTimelinePoint[];
  instrumentOptions: DashboardInstrumentOption[];
  instrumentBreakdown: DashboardInstrumentBreakdown[];
};

export type InstrumentHoldingTimelinePoint = {
  date: Date;
  unitPrice: number;
  unitsHeld: number;
  holdingValue: number;
};

export type InstrumentHoldingTimeline = {
  points: InstrumentHoldingTimelinePoint[];
  summary: {
    unitsHeld: number;
    investedAmount: number;
    latestHoldingValue: number;
    pnl: number;
  };
};

export type InstrumentTimelineEntry = {
  kind: InvestmentKindValue;
  code: string;
  stockMarket: StockMarketValue | null;
  timeline: InstrumentHoldingTimeline;
};

export type InvestmentMarketDataContext = {
  usdInrRate: number | null;
  usdInrHistory: PriceHistoryPoint[];
  quoteByInstrumentKey: Map<string, Quote>;
  nameByInstrumentKey: Map<string, string>;
  historyByInstrumentKey: Map<string, PriceHistoryPoint[]>;
};

export type InvestmentsPageData = {
  table: {
    investments: EnrichedInvestment[];
    pageCount: number;
    rowsCount: number;
  };
  dashboard: InvestmentsDashboard;
  instrumentTimelines: InstrumentTimelineEntry[];
  defaultRange: {
    range: '1m';
    startDate: Date;
    endDate: Date;
  };
};

export type InvestmentsRangeTimelines = {
  range: InvestmentTimelineRangeValue;
  startDate: Date;
  endDate: Date;
  timeline: InvestmentTimelinePoint[];
  instrumentTimelines: InstrumentTimelineEntry[];
};

export type EnrichedInvestment = InvestmentRow & {
  normalizedKind: InvestmentKindValue;
  normalizedStockMarket: StockMarketValue | null;
  displayCurrency: DisplayCurrencyValue;
  isRsuPosition: boolean;
  isExcludedFromPortfolioPosition: boolean;
  investedAmountInr: number;
  investedAmountNative: number;
  investedAmountCurrency: string;
  investedAmountFxRateToInr: number | null;
  currentFxRateToInr: number | null;
  investedAmountInrAtCurrentFx: number | null;
  investedAmountDisplay: number;
  instrumentName: string | null;
  isClosedPosition: boolean;
  liveUnitPrice: number | null;
  liveUnitPriceNative: number | null;
  liveUnitPriceCurrency: string | null;
  liveFxRateToInr: number | null;
  liveUnitPriceDisplay: number | null;
  valuationAmount: number | null;
  valuationAmountDisplay: number | null;
  currentValueInrAtCurrentFx: number | null;
  pnl: number | null;
  pnlDisplay: number | null;
  pnlPercentage: number | null;
  dayChange: number | null;
  dayChangeDisplay: number | null;
  dayChangePercentage: number | null;
  valuationSource: string | null;
  valuationDate: Date | null;
};
