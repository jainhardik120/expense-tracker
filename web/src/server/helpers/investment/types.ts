import type { investments } from '@/db/schema';
import type { EpfoInterestFactors } from '@/lib/epfo';
import type { AssetClassTagValue, InvestmentKindValue, StockMarketValue } from '@/lib/investments';

export type EpfoSchedule = {
  salaryPeriodStart: Date | null;
  dueMonth: Date;
  factors: EpfoInterestFactors;
};

export type InvestmentRow = typeof investments.$inferSelect & {
  assetClass?: AssetClassTagValue | null;
  epfoSchedule?: EpfoSchedule;
};

export type PriceHistoryPoint = {
  date: Date;
  price: number;
};

export type Quote = {
  unitPriceInr: number;
  unitPriceNative: number;
  nativeCurrency: string;
  fxRateToInr: number | null;
  asOf: Date | null;
  source: string;
  previousCloseInr?: number | null;
};

export type InstrumentIdentity = {
  kind: InvestmentKindValue;
  code: string;
  stockMarket: StockMarketValue | null;
};

export type ProviderTarget = {
  kind: InvestmentKindValue;
  stockMarket: StockMarketValue | null;
};

export type ProviderMarketDataContext = {
  usdInrRate: number | null;
  usdInrHistory: PriceHistoryPoint[];
};

export type InvestmentInstrumentSearchResult = {
  code: string;
  name: string;
  kind: InvestmentKindValue;
  source: string;
};
