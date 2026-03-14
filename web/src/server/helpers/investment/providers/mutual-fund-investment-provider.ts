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
      .slice(0, 25)
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
    const payload = await fetchJson<{
      data?: Array<{ date: string; nav: string }>;
    }>(`https://api.mfapi.in/mf/${encodeURIComponent(instrument.code)}`, {
      cache: 'no-store',
    });

    const values = payload?.data ?? [];
    return values
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
      .reverse()
      .filter((value) => {
        return (
          value.date.getTime() >= startOfDay(startDate).getTime() &&
          value.date.getTime() <= startOfDay(endDate).getTime()
        );
      });
  }
}
