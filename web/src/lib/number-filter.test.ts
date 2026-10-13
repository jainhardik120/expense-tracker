import { expect, test } from 'vitest';

import { matchesNumberFilter, parseNumberFilter, serializeNumberFilter } from '@/lib/number-filter';

test('a comparison needs exactly one amount', () => {
  expect(parseNumberFilter(['gt', '500'])).toEqual({ operator: 'gt', values: [500] });
  expect(parseNumberFilter(['gt'])).toBeNull();
  expect(parseNumberFilter(['gt', '500', '600'])).toBeNull();
});

test('between takes two amounts in either order', () => {
  expect(parseNumberFilter(['between', '500', '100'])).toEqual({
    operator: 'between',
    values: [100, 500],
  });
});

test('zero and not zero take no amount', () => {
  expect(parseNumberFilter(['zero'])).toEqual({ operator: 'zero', values: [] });
  expect(parseNumberFilter(['nonzero', '1'])).toBeNull();
});

test('anything malformed is no filter at all', () => {
  expect(parseNumberFilter([])).toBeNull();
  expect(parseNumberFilter(['bogus', '1'])).toBeNull();
  expect(parseNumberFilter(['lt', 'abc'])).toBeNull();
  expect(parseNumberFilter(['lt', ''])).toBeNull();
});

test('decimals survive the round trip through the URL', () => {
  const filter = parseNumberFilter(['lte', '249.5']);
  expect(filter).not.toBeNull();
  if (filter !== null) {
    expect(parseNumberFilter(serializeNumberFilter(filter))).toEqual(filter);
  }
});

test('bounds are inclusive only where the operator says so', () => {
  expect(matchesNumberFilter({ operator: 'gt', values: [500] }, 500)).toBe(false);
  expect(matchesNumberFilter({ operator: 'gte', values: [500] }, 500)).toBe(true);
  expect(matchesNumberFilter({ operator: 'between', values: [100, 500] }, 500)).toBe(true);
  expect(matchesNumberFilter({ operator: 'lt', values: [100] }, 0)).toBe(true);
  expect(matchesNumberFilter({ operator: 'zero', values: [] }, 0)).toBe(true);
  expect(matchesNumberFilter({ operator: 'nonzero', values: [] }, 0)).toBe(false);
});
