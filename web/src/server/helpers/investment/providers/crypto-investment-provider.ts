import type {
  InstrumentIdentity,
  InvestmentInstrumentSearchResult,
  PriceHistoryPoint,
  ProviderTarget,
  Quote,
} from '../types';

import { BaseInvestmentInstrumentProvider } from '../provider-interface';
import {
  createInstrumentKey,
  DAY_IN_MS,
  fetchJson,
  getCoinGeckoHeaders,
  startOfDay,
} from '../shared';

export class CryptoInvestmentProvider extends BaseInvestmentInstrumentProvider {
  readonly id = 'crypto';

  matches(target: ProviderTarget): boolean {
    return target.kind === 'crypto';
  }

  async search(query: string): Promise<InvestmentInstrumentSearchResult[]> {
    const payload = await fetchJson<{
      coins?: Array<{
        id?: string;
        name?: string;
        symbol?: string;
        market_cap_rank?: number;
      }>;
    }>(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, {
      cache: 'no-store',
      headers: getCoinGeckoHeaders(),
    });

    const coins = payload?.coins ?? [];
    const sorted = [...coins].sort((left, right) => {
      const leftRank = left.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
      const rightRank = right.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });

    return sorted.slice(0, 20).map((coin) => {
      const name = coin.name ?? coin.id ?? '';
      const symbolSuffix = coin.symbol === undefined ? '' : ` (${coin.symbol.toUpperCase()})`;
      return {
        code: coin.id ?? '',
        name: `${name}${symbolSuffix}`,
        kind: 'crypto',
        source: 'coingecko',
      };
    });
  }

  async resolveNames(instruments: InstrumentIdentity[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const normalizedCodes = [
      ...new Set(
        instruments.map((instrument) => instrument.code.trim().toLowerCase()).filter(Boolean),
      ),
    ];
    const nameById = new Map<string, string>();

    const payload = await fetchJson<
      Array<{
        id?: string;
        name?: string;
        symbol?: string;
      }>
    >(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&ids=${encodeURIComponent(normalizedCodes.join(','))}&per_page=250&page=1&sparkline=false`,
      {
        cache: 'no-store',
        headers: getCoinGeckoHeaders(),
      },
    );
    const coins = payload ?? [];
    for (const coin of coins) {
      const id = coin.id?.trim().toLowerCase();
      if (id === undefined || id === '') {
        continue;
      }
      const baseName = coin.name?.trim();
      if (baseName === undefined || baseName === '') {
        continue;
      }
      const symbolSuffix = coin.symbol === undefined ? '' : ` (${coin.symbol.toUpperCase()})`;
      nameById.set(id, `${baseName}${symbolSuffix}`);
    }

    for (const instrument of instruments) {
      const normalizedCode = instrument.code.trim();
      if (normalizedCode === '') {
        continue;
      }
      const resolvedName = nameById.get(normalizedCode.toLowerCase());
      if (resolvedName !== undefined) {
        names.set(createInstrumentKey('crypto', normalizedCode, null), resolvedName);
      }
    }

    return names;
  }

  async getLiveQuotes(instruments: InstrumentIdentity[]): Promise<Map<string, Quote>> {
    const quotesByCode = new Map<string, Quote>();
    const normalizedCodes = [
      ...new Set(
        instruments.map((instrument) => instrument.code.trim().toLowerCase()).filter(Boolean),
      ),
    ];
    if (normalizedCodes.length === 0) {
      return quotesByCode;
    }

    const payload = await fetchJson<
      Record<string, { inr?: number; last_updated_at?: number } | undefined>
    >(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(normalizedCodes.join(','))}&vs_currencies=inr&include_last_updated_at=true`,
      {
        cache: 'no-store',
        headers: getCoinGeckoHeaders(),
      },
    );

    if (payload === null) {
      return quotesByCode;
    }

    for (const code of normalizedCodes) {
      const quote = payload[code];
      if (quote?.inr === undefined || !Number.isFinite(quote.inr) || quote.inr <= 0) {
        continue;
      }
      quotesByCode.set(createInstrumentKey('crypto', code, null), {
        unitPriceInr: quote.inr,
        unitPriceNative: quote.inr,
        nativeCurrency: 'INR',
        fxRateToInr: 1,
        asOf: quote.last_updated_at === undefined ? null : new Date(quote.last_updated_at * 1000),
        source: 'coingecko',
      });
    }

    return quotesByCode;
  }

  async getHistoricalPrices(
    instrument: InstrumentIdentity,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceHistoryPoint[]> {
    const periodStart = Math.floor(startOfDay(startDate).getTime() / 1000);
    const periodEnd = Math.floor((startOfDay(endDate).getTime() + DAY_IN_MS) / 1000);
    const payload = await fetchJson<{ prices?: Array<[number, number]> }>(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(instrument.code.toLowerCase())}/market_chart/range?vs_currency=inr&from=${periodStart}&to=${periodEnd}`,
      {
        cache: 'no-store',
        headers: getCoinGeckoHeaders(),
      },
    );
    const values = payload?.prices ?? [];
    return values
      .map((value) => ({
        date: new Date(value[0]),
        price: value[1],
      }))
      .filter((value) => Number.isFinite(value.price) && value.price > 0);
  }
}
