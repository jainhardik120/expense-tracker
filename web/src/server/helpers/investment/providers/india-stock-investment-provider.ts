import { normalizeStockMarket } from '@/lib/investments';
import {
  growwDailyCandles,
  growwLatestPrices,
  growwSearch,
  livePointTime,
} from '@/server/helpers/groww/client';

import { BSE_SUFFIX, NSE_SUFFIX, parseIndianListing } from './indian-listing';

import type {
  InstrumentIdentity,
  InvestmentInstrumentSearchResult,
  PriceHistoryPoint,
  ProviderTarget,
  Quote,
} from '../types';

import { BaseInvestmentInstrumentProvider } from '../provider-interface';
import { createInstrumentKey } from '../shared';

const SOURCE = 'groww';
const LISTED_CODE = /^[A-Z0-9&-]+$/;
const LISTED_TYPES = new Set(['Stocks', 'ETF']);

const listedHits = async (query: string) =>
  (await growwSearch(query, 'listed')).filter((hit) => LISTED_TYPES.has(hit.entity_type ?? ''));

const listingCode = (hit: { nse_scrip_code?: string | null; bse_scrip_code?: string | null }) => {
  if (hit.nse_scrip_code !== null && hit.nse_scrip_code !== undefined) {
    return `${hit.nse_scrip_code}${NSE_SUFFIX}`;
  }
  const bse = hit.bse_scrip_code ?? '';
  return LISTED_CODE.test(bse) ? `${bse}${BSE_SUFFIX}` : null;
};

const instrumentKey = (code: string) => createInstrumentKey('stocks', code.trim(), 'IN');

export class IndiaStockInvestmentProvider extends BaseInvestmentInstrumentProvider {
  readonly id = 'stocks-in';

  matches(target: ProviderTarget): boolean {
    return target.kind === 'stocks' && normalizeStockMarket(target.stockMarket) === 'IN';
  }

  async search(query: string): Promise<InvestmentInstrumentSearchResult[]> {
    const hits = await listedHits(query);
    return hits.flatMap((hit) => {
      const code = listingCode(hit);
      return code === null || hit.title === undefined
        ? []
        : [{ code, name: hit.title, kind: 'stocks' as const, source: SOURCE }];
    });
  }

  async resolveNames(instruments: InstrumentIdentity[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    await Promise.all(
      instruments.map(async (instrument) => {
        const { exchange, symbol } = parseIndianListing(instrument.code);
        const hits = await listedHits(symbol);
        const match = hits.find((hit) =>
          exchange === 'NSE' ? hit.nse_scrip_code === symbol : hit.bse_scrip_code === symbol,
        );
        if (match?.title !== undefined) {
          names.set(instrumentKey(instrument.code), match.title);
        }
      }),
    );
    return names;
  }

  async getLiveQuotes(instruments: InstrumentIdentity[]): Promise<Map<string, Quote>> {
    const listings = instruments.map((instrument) => ({
      code: instrument.code,
      ...parseIndianListing(instrument.code),
    }));
    const prices = await growwLatestPrices({
      NSE: listings.filter((item) => item.exchange === 'NSE').map((item) => item.symbol),
      BSE: listings.filter((item) => item.exchange === 'BSE').map((item) => item.symbol),
    });
    const quotes = new Map<string, Quote>();
    for (const listing of listings) {
      const point = prices?.get(`${listing.exchange}:${listing.symbol}`);
      const price = point?.ltp;
      if (point === undefined || typeof price !== 'number' || price <= 0) {
        continue;
      }
      quotes.set(instrumentKey(listing.code), {
        unitPriceInr: price,
        unitPriceNative: price,
        nativeCurrency: 'INR',
        fxRateToInr: 1,
        asOf: livePointTime(point),
        source: SOURCE,
        previousCloseInr: point.close ?? null,
      });
    }
    return quotes;
  }

  async getHistoricalPrices(
    instrument: InstrumentIdentity,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceHistoryPoint[]> {
    const { exchange, symbol } = parseIndianListing(instrument.code);
    return (await growwDailyCandles(exchange, symbol, startDate, endDate)) ?? [];
  }
}
