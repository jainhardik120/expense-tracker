import { MS_PER_MINUTE } from '@/types';

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
  fetchJson,
  getMutualFundSchemes,
  parseMfDate,
  parseNumericString,
  startOfDay,
} from '../shared';

const MAX_SEARCH_RESULTS = 25;

/**
 * A fund's whole NAV history, parsed once and kept as long as the response.
 *
 * mfapi.in answers with every NAV since the fund launched -- thousands of days
 * -- and each investments page wants only the last month. Parsing the full
 * history on every load, for every fund, was most of the page's CPU. The
 * parsed series is kept for as long as the raw response would be, oldest day
 * first; callers get a fresh filtered array, and nothing writes to its points.
 * Failures and empty answers are not kept.
 */
const NAV_HISTORY_TTL_MINUTES = 15;
const NAV_HISTORY_TTL_MS = NAV_HISTORY_TTL_MINUTES * MS_PER_MINUTE;
const navHistories = new Map<string, { points: PriceHistoryPoint[]; at: number }>();

const navHistory = async (code: string): Promise<PriceHistoryPoint[]> => {
  const kept = navHistories.get(code);
  if (kept !== undefined && Date.now() - kept.at < NAV_HISTORY_TTL_MS) {
    return kept.points;
  }
  const payload = await fetchJson<{
    data?: Array<{ date: string; nav: string }>;
  }>(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, {
    cache: 'no-store',
  });
  const points = (payload?.data ?? [])
    .map((value) => {
      const parsedDate = parseMfDate(value.date);
      const nav = parseNumericString(value.nav);
      if (parsedDate === null || !Number.isFinite(nav) || nav <= 0) {
        return null;
      }
      return {
        date: parsedDate,
        price: nav,
      };
    })
    .filter((value): value is PriceHistoryPoint => value !== null)
    .reverse();
  if (points.length > 0) {
    navHistories.set(code, { points, at: Date.now() });
  }
  return points;
};

export class MutualFundInvestmentProvider extends BaseInvestmentInstrumentProvider {
  readonly id = 'mutual-funds';

  matches(target: ProviderTarget): boolean {
    return target.kind === 'mutual_funds';
  }

  async search(query: string): Promise<InvestmentInstrumentSearchResult[]> {
    const schemes = await getMutualFundSchemes();
    const normalized = query.toLowerCase().trim();

    return schemes
      .filter((item) => {
        const byName = item.schemeName.toLowerCase().includes(normalized);
        const byCode = String(item.schemeCode).includes(normalized);
        return byName || byCode;
      })
      .slice(0, MAX_SEARCH_RESULTS)
      .map((item) => ({
        code: String(item.schemeCode),
        name: item.schemeName,
        kind: 'mutual_funds',
        source: 'mfapi.in',
      }));
  }

  async resolveNames(instruments: InstrumentIdentity[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const schemes = await getMutualFundSchemes();
    const schemeByCode = new Map<string, string>();
    for (const scheme of schemes) {
      schemeByCode.set(String(scheme.schemeCode), scheme.schemeName);
    }

    for (const instrument of instruments) {
      const normalizedCode = instrument.code.trim();
      if (normalizedCode === '') {
        continue;
      }
      const resolvedName = schemeByCode.get(normalizedCode);
      if (resolvedName !== undefined && resolvedName.trim() !== '') {
        names.set(createInstrumentKey('mutual_funds', normalizedCode, null), resolvedName.trim());
      }
    }

    return names;
  }

  async getLiveQuotes(instruments: InstrumentIdentity[]): Promise<Map<string, Quote>> {
    const quotesByCode = new Map<string, Quote>();
    const normalizedCodes = [
      ...new Set(instruments.map((instrument) => instrument.code.trim()).filter(Boolean)),
    ];

    await Promise.all(
      normalizedCodes.map(async (code) => {
        const payload = await fetchJson<{
          data?: Array<{ date: string; nav: string }>;
        }>(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, {
          cache: 'no-store',
        });
        const nav = payload?.data?.[0];
        if (nav === undefined) {
          return;
        }
        const price = parseNumericString(nav.nav);
        if (!Number.isFinite(price) || price <= 0) {
          return;
        }
        quotesByCode.set(code, {
          // Store values under the instrument identity key so the caller can merge generically.
          unitPriceInr: price,
          unitPriceNative: price,
          nativeCurrency: 'INR',
          fxRateToInr: 1,
          asOf: parseMfDate(nav.date),
          source: 'mfapi.in',
        });
      }),
    );

    return new Map(
      [...quotesByCode.entries()].map(([code, quote]) => [
        createInstrumentKey('mutual_funds', code, null),
        quote,
      ]),
    );
  }

  async getHistoricalPrices(
    instrument: InstrumentIdentity,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceHistoryPoint[]> {
    const history = await navHistory(instrument.code);
    // Bounds worked out once, not once per day of the fund's history.
    const from = startOfDay(startDate).getTime();
    const to = startOfDay(endDate).getTime();
    return history.filter((value) => value.date.getTime() >= from && value.date.getTime() <= to);
  }
}
