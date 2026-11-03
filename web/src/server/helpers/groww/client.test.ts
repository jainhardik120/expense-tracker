import { expect, test } from 'vitest';

import { istDay } from './client';

test('istDay maps an IST-midnight timestamp to that IST calendar day', () => {
  expect(istDay(Date.parse('2026-11-01T18:30:00Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  expect(istDay(Date.parse('2026-11-02T09:00:00Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
});
