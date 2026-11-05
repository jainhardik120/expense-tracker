import { expect, test } from 'vitest';

import { estimateFundPercents } from './today-estimate';

const holdings = [
  { schemeCode: 'A', stockRef: 'big', weightPercent: 50 },
  { schemeCode: 'A', stockRef: 'small', weightPercent: 10 },
  { schemeCode: 'B', stockRef: 'big', weightPercent: 20 },
];

const changes = new Map([
  ['big', 2],
  ['small', -5],
]);

test('adds up each holding weighted by its move', () => {
  const navDays = new Map([
    ['A', '2026-11-04'],
    ['B', '2026-11-04'],
  ]);
  expect(estimateFundPercents(holdings, changes, navDays, '2026-11-05')).toEqual({
    A: 0.5,
    B: 0.4,
  });
});

test('skips a fund whose NAV already includes the trading day', () => {
  const navDays = new Map([
    ['A', '2026-11-05'],
    ['B', '2026-11-04'],
  ]);
  expect(estimateFundPercents(holdings, changes, navDays, '2026-11-05')).toEqual({ B: 0.4 });
});

test('leaves out a holding with no live move', () => {
  const navDays = new Map([['A', '2026-11-04']]);
  const onlyBig = new Map([['big', 2]]);
  expect(estimateFundPercents(holdings.slice(0, 2), onlyBig, navDays, '2026-11-05')).toEqual({
    A: 1,
  });
});
