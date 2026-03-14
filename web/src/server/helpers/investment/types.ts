import type { investments } from '@/db/schema';
import type { InvestmentKindValue, StockMarketValue } from '@/lib/investments';

export type InvestmentRow = typeof investments.$inferSelect;

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
