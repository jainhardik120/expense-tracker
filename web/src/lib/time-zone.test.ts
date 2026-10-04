import { describe, expect, test, vi } from 'vitest';

vi.mock('next-client-cookies/server', () => ({ getCookies: () => ({ get: () => undefined }) }));

const { isValidTimeZone } = await import('./date');

describe('isValidTimeZone', () => {
  test.each(['UTC', 'Asia/Kolkata', 'Asia/Calcutta', 'America/New_York', 'Etc/GMT+5'])(
    'accepts %s',
    (zone) => {
      expect(isValidTimeZone(zone)).toBe(true);
    },
  );

  test.each([
    "UTC'), (select 1",
    "Asia/Kolkata' --",
    'Asia/Nowhere',
    '',
    'UTC; drop table statements',
    '../etc/passwd',
  ])('rejects %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});
