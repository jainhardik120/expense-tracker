import { expect, test, vi } from 'vitest';

import { getUnitInstrumentOneDayMetricsByKey } from './market-data';

import type { InvestmentMarketDataContext } from './models';
import type { InvestmentRow } from './types';

vi.mock('@/lib/env', () => ({ env: {} }));
vi.mock('./market-cache', () => ({}));

const key = 'stocks:IN:TATAGOLD.NS';

const row = { investmentKind: 'stocks', instrumentCode: 'TATAGOLD.NS', stockMarket: 'IN' };

const history = [
  { date: new Date('2026-11-03T00:00:00Z'), price: 13.27 },
  { date: new Date('2026-11-04T00:00:00Z'), price: 13.68 },
];

const metricsFor = (previousCloseInr: number | null, asOf: string) =>
  getUnitInstrumentOneDayMetricsByKey({
    investmentsList: [row as InvestmentRow],
    asOfDate: new Date('2026-11-05T00:00:00Z'),
    marketDataContext: {
      historyByInstrumentKey: new Map([[key, history]]),
      quoteByInstrumentKey: new Map([
        [
          key,
          {
            unitPriceInr: 13.89,
            unitPriceNative: 13.89,
            nativeCurrency: 'INR',
            fxRateToInr: 1,
            asOf: new Date(asOf),
            source: 'groww',
            previousCloseInr,
          },
        ],
      ]),
    } as unknown as InvestmentMarketDataContext,
  }).get(key);

test('one day change uses the close quoted with the price, even on a midnight timestamp', () => {
  expect(metricsFor(13.68, '2026-11-04T18:30:00Z')?.previousUnitPriceInr).toBeCloseTo(13.68);
});

test('one day change falls back to history when the quote has no previous close', () => {
  expect(metricsFor(null, '2026-11-05T10:29:55Z')?.previousUnitPriceInr).toBeCloseTo(13.68);
});
