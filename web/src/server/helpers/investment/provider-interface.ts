import type {
  Quote,
  InstrumentIdentity,
  InvestmentInstrumentSearchResult,
  PriceHistoryPoint,
  ProviderMarketDataContext,
  ProviderTarget,
} from './types';

export interface InvestmentInstrumentProvider {
  readonly id: string;
  matches(target: ProviderTarget): boolean;
  search(query: string): Promise<InvestmentInstrumentSearchResult[]>;
  resolveNames(instruments: InstrumentIdentity[]): Promise<Map<string, string>>;
  getLiveQuotes(
    instruments: InstrumentIdentity[],
    context: ProviderMarketDataContext,
  ): Promise<Map<string, Quote>>;
  getHistoricalPrices(
    instrument: InstrumentIdentity,
    startDate: Date,
    endDate: Date,
    context: ProviderMarketDataContext,
  ): Promise<PriceHistoryPoint[]>;
}

export abstract class BaseInvestmentInstrumentProvider implements InvestmentInstrumentProvider {
  abstract readonly id: string;

  abstract matches(target: ProviderTarget): boolean;

  async search(_query: string): Promise<InvestmentInstrumentSearchResult[]> {
    return [];
  }

  async resolveNames(_instruments: InstrumentIdentity[]): Promise<Map<string, string>> {
    return new Map<string, string>();
  }

  async getLiveQuotes(
    _instruments: InstrumentIdentity[],
    _context: ProviderMarketDataContext,
  ): Promise<Map<string, Quote>> {
    return new Map<string, Quote>();
  }

  async getHistoricalPrices(
    _instrument: InstrumentIdentity,
    _startDate: Date,
    _endDate: Date,
    _context: ProviderMarketDataContext,
  ): Promise<PriceHistoryPoint[]> {
    return [];
  }
}
