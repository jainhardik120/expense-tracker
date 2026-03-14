import { normalizeStockMarket, type StockMarketValue } from '@/lib/investments';

import type {
  InstrumentIdentity,
  InvestmentInstrumentSearchResult,
  PriceHistoryPoint,
  ProviderMarketDataContext,
  ProviderTarget,
  Quote,
} from '../types';

import { BaseInvestmentInstrumentProvider } from '../provider-interface';
import {
  convertPriceToInr,
  createInstrumentKey,
  DEFAULT_USER_AGENT,
  DAY_IN_MS,
  fetchJson,
  getFxRateToInrFromHistory,
  getYahooStockSymbol,
  splitIntoChunks,
  startOfDay,
} from '../shared';

const US_STOCK_EXCHANGES = new Set(['NMS', 'NAS', 'NGM', 'NYQ', 'ASE', 'PCX', 'PNK']);

abstract class YahooStockInvestmentProvider extends BaseInvestmentInstrumentProvider {
  constructor(protected readonly stockMarket: StockMarketValue) {
    super();
  }

  matches(target: ProviderTarget): boolean {
    return (
      target.kind === 'stocks' && normalizeStockMarket(target.stockMarket) === this.stockMarket
    );
  }

  async search(query: string): Promise<InvestmentInstrumentSearchResult[]> {
    const payload = await fetchJson<{
      quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        quoteType?: string;
        exchange?: string;
      }>;
    }>(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=25&newsCount=0`,
      {
        cache: 'no-store',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
        },
      },
    );

    const quotes = payload?.quotes ?? [];
    const filtered = quotes
      .filter((item) => item.quoteType === 'EQUITY')
      .filter((item) => {
        const symbol = item.symbol ?? '';
        const exchange = (item.exchange ?? '').toUpperCase();
        if (this.stockMarket === 'IN') {
          return (
            symbol.endsWith('.NS') ||
            symbol.endsWith('.BO') ||
            exchange === 'NSI' ||
            exchange === 'BSE'
          );
        }
        if (symbol.includes('.')) {
          return false;
        }
        return US_STOCK_EXCHANGES.has(exchange);
      })
      .slice(0, 20);

    return filtered.map((item) => ({
      code: item.symbol ?? '',
      name: item.longname ?? item.shortname ?? item.symbol ?? '',
      kind: 'stocks',
      source: 'yahoo-search',
    }));
  }

  async resolveNames(instruments: InstrumentIdentity[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const requests = instruments
      .map((instrument) => {
        const code = instrument.code.trim();
        return {
          code,
          symbol: getYahooStockSymbol(code, this.stockMarket),
        };
      })
      .filter((item) => item.code !== '');

    const uniqueSymbols = [...new Set(requests.map((item) => item.symbol))];
    const nameBySymbol = new Map<string, string>();

    await Promise.all(
      splitIntoChunks(uniqueSymbols, 40).map(async (symbolsBatch) => {
        const payload = await fetchJson<{
          quoteResponse?: {
            result?: Array<{
              symbol?: string;
              longName?: string;
              shortName?: string;
              displayName?: string;
            }>;
          };
        }>(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolsBatch.join(','))}`,
          {
            cache: 'no-store',
            headers: {
              'User-Agent': DEFAULT_USER_AGENT,
            },
          },
        );
        const quotes = payload?.quoteResponse?.result ?? [];
        for (const quote of quotes) {
          const symbol = quote.symbol?.toUpperCase();
          if (symbol === undefined || symbol === '') {
            continue;
          }
          const resolvedName = quote.longName ?? quote.shortName ?? quote.displayName;
          if (resolvedName === undefined || resolvedName.trim() === '') {
            continue;
          }
          nameBySymbol.set(symbol, resolvedName.trim());
        }
      }),
    );

    for (const request of requests) {
      const resolvedName = nameBySymbol.get(request.symbol);
      if (resolvedName !== undefined) {
        names.set(createInstrumentKey('stocks', request.code, this.stockMarket), resolvedName);
      }
    }

    return names;
  }

  async getLiveQuotes(
    instruments: InstrumentIdentity[],
    context: ProviderMarketDataContext,
  ): Promise<Map<string, Quote>> {
    const quotesByCode = new Map<string, Quote>();
    const normalizedInstruments = instruments
      .map((instrument) => instrument.code.trim())
      .filter((code) => code !== '');

    await Promise.all(
      normalizedInstruments.map(async (code) => {
        const symbol = getYahooStockSymbol(code, this.stockMarket);
        const payload = await fetchJson<{
          chart?: {
            result?: Array<{
              meta?: {
                regularMarketPrice?: number;
                regularMarketTime?: number;
                currency?: string;
              };
            }>;
          };
        }>(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
          {
            cache: 'no-store',
            headers: {
              'User-Agent': DEFAULT_USER_AGENT,
            },
          },
        );
        let marketPrice = payload?.chart?.result?.[0]?.meta?.regularMarketPrice;
        let marketTime = payload?.chart?.result?.[0]?.meta?.regularMarketTime;
        let marketCurrency = payload?.chart?.result?.[0]?.meta?.currency;

        if (marketPrice === undefined || !Number.isFinite(marketPrice) || marketPrice <= 0) {
          const quotePayload = await fetchJson<{
            quoteResponse?: {
              result?: Array<{
                regularMarketPrice?: number;
                regularMarketTime?: number;
                currency?: string;
              }>;
            };
          }>(
            `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
            {
              cache: 'no-store',
              headers: {
                'User-Agent': DEFAULT_USER_AGENT,
              },
            },
          );
          const quoteResult = quotePayload?.quoteResponse?.result?.[0];
          marketPrice = quoteResult?.regularMarketPrice;
          marketTime = quoteResult?.regularMarketTime;
          marketCurrency = quoteResult?.currency;
        }

        if (marketPrice === undefined || !Number.isFinite(marketPrice) || marketPrice <= 0) {
          return;
        }
        const converted = convertPriceToInr({
          unitPrice: marketPrice,
          nativeCurrencyRaw: marketCurrency ?? (this.stockMarket === 'US' ? 'USD' : 'INR'),
          usdInrRate: context.usdInrRate,
        });
        if (converted === null) {
          return;
        }
        quotesByCode.set(createInstrumentKey('stocks', code, this.stockMarket), {
          unitPriceInr: converted.unitPriceInr,
          unitPriceNative: marketPrice,
          nativeCurrency: converted.nativeCurrency,
          fxRateToInr: converted.fxRateToInr,
          asOf: marketTime === undefined ? null : new Date(marketTime * 1000),
          source: 'yahoo-finance',
        });
      }),
    );

    return quotesByCode;
  }

  async getHistoricalPrices(
    instrument: InstrumentIdentity,
    startDate: Date,
    endDate: Date,
    context: ProviderMarketDataContext,
  ): Promise<PriceHistoryPoint[]> {
    const symbol = getYahooStockSymbol(instrument.code, this.stockMarket);
    const periodStart = Math.floor(startOfDay(startDate).getTime() / 1000);
    const periodEnd = Math.floor((startOfDay(endDate).getTime() + DAY_IN_MS) / 1000);
    const payload = await fetchJson<{
      chart?: {
        result?: Array<{
          meta?: {
            currency?: string;
          };
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    }>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${periodStart}&period2=${periodEnd}`,
      {
        cache: 'no-store',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
        },
      },
    );
    const result = payload?.chart?.result?.[0];
    const nativeCurrency = result?.meta?.currency ?? (this.stockMarket === 'US' ? 'USD' : 'INR');
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const points: PriceHistoryPoint[] = [];

    for (const [index, timestamp] of timestamps.entries()) {
      const close = closes[index];
      if (close === null) {
        continue;
      }
      const closeDate = new Date(timestamp * 1000);
      const fxRateToInr =
        nativeCurrency === 'USD'
          ? getFxRateToInrFromHistory(closeDate, context.usdInrHistory, context.usdInrRate)
          : context.usdInrRate;
      const converted = convertPriceToInr({
        unitPrice: close,
        nativeCurrencyRaw: nativeCurrency,
        usdInrRate: fxRateToInr,
      });
      if (converted === null) {
        continue;
      }
      points.push({
        date: closeDate,
        price: converted.unitPriceInr,
      });
    }
    return points;
  }
}

export class IndiaStockInvestmentProvider extends YahooStockInvestmentProvider {
  readonly id = 'stocks-in';

  constructor() {
    super('IN');
  }
}

export class UsStockInvestmentProvider extends YahooStockInvestmentProvider {
  readonly id = 'stocks-us';

  constructor() {
    super('US');
  }
}
