import { expect, test } from 'vitest';

import { parseCroreValue } from './parse';

test('parseCroreValue reads Groww market caps in crore', () => {
  expect(parseCroreValue('₹9,94,760Cr')).toBe(994_760);
  expect(parseCroreValue('₹1,234.5 Cr')).toBe(1234.5);
  expect(parseCroreValue(null)).toBeNull();
});
