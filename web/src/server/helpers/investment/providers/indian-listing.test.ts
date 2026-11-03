import { expect, test } from 'vitest';

import { parseIndianListing } from './indian-listing';

test('parseIndianListing reads NSE and BSE codes', () => {
  expect(parseIndianListing('tatagold.ns')).toEqual({ exchange: 'NSE', symbol: 'TATAGOLD' });
  expect(parseIndianListing('540725.BO')).toEqual({ exchange: 'BSE', symbol: '540725' });
  expect(parseIndianListing('M&M')).toEqual({ exchange: 'NSE', symbol: 'M&M' });
});
