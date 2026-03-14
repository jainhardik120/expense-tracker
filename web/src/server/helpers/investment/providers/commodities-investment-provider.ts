import {
  commodityList,
  fetchCommodityHistoricalPrices,
  fetchCommodityLiveQuote,
  getCommodityDefinition,
} from './commodity-market-data';

import type {
  InstrumentIdentity,
  InvestmentInstrumentSearchResult,
  PriceHistoryPoint,
  ProviderMarketDataContext,
  ProviderTarget,
  Quote,
} from '../types';

import { BaseInvestmentInstrumentProvider } from '../provider-interface';
import { createInstrumentKey } from '../shared';

export class CommoditiesInvestmentProvider extends BaseInvestmentInstrumentProvider {
  readonly id = 'commodities';

  matches(target: ProviderTarget): boolean {
    return target.kind === 'commodities';
  }

  async search(query: string): Promise<InvestmentInstrumentSearchResult[]> {
    const normalized = query.trim().toLowerCase();
    return commodityList
      .filter((commodity) => {
        return (
          commodity.code.includes(normalized) || commodity.name.toLowerCase().includes(normalized)
        );
      })
      .map((commodity) => ({
        code: commodity.code,
        name: commodity.name,
        kind: 'commodities',
        source: 'internal',
      }));
  }

  async resolveNames(instruments: InstrumentIdentity[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    for (const instrument of instruments) {
      const code = instrument.code.trim();
      const definition = getCommodityDefinition(code);
      if (definition === undefined) {
        continue;
      }
      names.set(createInstrumentKey('commodities', code, null), definition.name);
    }
    return names;
  }

  async getLiveQuotes(
    instruments: InstrumentIdentity[],
    _context: ProviderMarketDataContext,
  ): Promise<Map<string, Quote>> {
    const quotes = new Map<string, Quote>();

    await Promise.all(
      instruments.map(async (instrument) => {
        const code = instrument.code.trim();
        const definition = getCommodityDefinition(code);
        if (definition === undefined) {
          return;
        }

        const quote = await fetchCommodityLiveQuote(definition);
        if (quote === null) {
          return;
        }

        quotes.set(createInstrumentKey('commodities', code, null), quote);
      }),
    );

    return quotes;
  }

  async getHistoricalPrices(
    instrument: InstrumentIdentity,
    startDate: Date,
    endDate: Date,
    _context: ProviderMarketDataContext,
  ): Promise<PriceHistoryPoint[]> {
    const definition = getCommodityDefinition(instrument.code.trim());
    if (definition === undefined) {
      return [];
    }

    return fetchCommodityHistoricalPrices(definition, startDate, endDate);
  }
}
