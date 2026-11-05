import { expect, test } from 'vitest';

import { istDay, livePointTime } from './client';

test('istDay maps an IST-midnight timestamp to that IST calendar day', () => {
  expect(istDay(Date.parse('2026-11-01T18:30:00Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  expect(istDay(Date.parse('2026-11-02T09:00:00Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
});

test('livePointTime keeps the last trade time once Groww resets its timestamp to midnight', () => {
  const midnight = Date.parse('2026-11-04T18:30:00Z') / 1000;
  const lastTrade = Date.parse('2026-11-05T10:29:55Z') / 1000;
  expect(livePointTime({ tsInMillis: midnight, lastTradeTime: lastTrade })?.toISOString()).toBe(
    '2026-11-05T10:29:55.000Z',
  );
  expect(livePointTime({ tsInMillis: midnight })?.toISOString()).toBe('2026-11-04T18:30:00.000Z');
  expect(livePointTime({})).toBeNull();
});
