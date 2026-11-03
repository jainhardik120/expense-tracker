import { growwFundNav, growwSearch } from '@/server/helpers/groww/client';

import type {
  InstrumentIdentity,
  InvestmentInstrumentSearchResult,
  PriceHistoryPoint,
  ProviderTarget,
  Quote,
} from '../types';

import { BaseInvestmentInstrumentProvider } from '../provider-interface';
import { createInstrumentKey, DAY_IN_MS, startOfDay } from '../shared';

const SOURCE = 'groww';
const RECENT_NAV_DAYS = 14;
const PREVIOUS_POINT = -2;

const instrumentKey = (code: string) => createInstrumentKey('mutual_funds', code.trim(), null);

const uniqueCodes = (instruments: InstrumentIdentity[]) => [
  ...new Set(instruments.map((instrument) => instrument.code.trim()).filter(Boolean)),
];

const recentStart = () => new Date(Date.now() - RECENT_NAV_DAYS * DAY_IN_MS);

export class MutualFundInvestmentProvider extends BaseInvestmentInstrumentProvider {
  readonly id = 'mutual-funds';

  matches(target: ProviderTarget): boolean {
    return target.kind === 'mutual_funds';
  }

  async search(query: string): Promise<InvestmentInstrumentSearchResult[]> {
    const hits = await growwSearch(query, 'scheme');
    return hits.flatMap((hit) =>
      hit.scheme_code === null || hit.scheme_code === undefined || hit.title === undefined
        ? []
        : [
            {
              code: hit.scheme_code,
              name: hit.title,
              kind: 'mutual_funds' as const,
              source: SOURCE,
            },
          ],
    );
  }

  async resolveNames(instruments: InstrumentIdentity[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    await Promise.all(
      uniqueCodes(instruments).map(async (code) => {
        const nav = await growwFundNav(code, recentStart());
        if (nav?.name !== null && nav?.name !== undefined) {
          names.set(instrumentKey(code), nav.name);
        }
      }),
    );
    return names;
  }

  async getLiveQuotes(instruments: InstrumentIdentity[]): Promise<Map<string, Quote>> {
    const quotes = new Map<string, Quote>();
    await Promise.all(
      uniqueCodes(instruments).map(async (code) => {
        const points = (await growwFundNav(code, recentStart()))?.points ?? [];
        const latest = points.at(-1);
        if (latest === undefined) {
          return;
        }
        quotes.set(instrumentKey(code), {
          unitPriceInr: latest.price,
          unitPriceNative: latest.price,
          nativeCurrency: 'INR',
          fxRateToInr: 1,
          asOf: latest.date,
          source: SOURCE,
          previousCloseInr: points.at(PREVIOUS_POINT)?.price ?? null,
        });
      }),
    );
    return quotes;
  }

  async getHistoricalPrices(
    instrument: InstrumentIdentity,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceHistoryPoint[]> {
    const points = (await growwFundNav(instrument.code, startDate))?.points ?? [];
    const from = startOfDay(startDate).getTime();
    const to = startOfDay(endDate).getTime();
    return points.filter((point) => point.date.getTime() >= from && point.date.getTime() <= to);
  }
}
