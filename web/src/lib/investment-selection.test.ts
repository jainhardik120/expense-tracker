import { expect, test } from 'vitest';

import { matchesStatus } from './investment-selection';

const open = { hasOpen: true, hasClosed: false };
const closed = { hasOpen: false, hasClosed: true };
const both = { hasOpen: true, hasClosed: true };
const noFilter = { status: [], instrument: [] };

test('hides closed positions when no status is chosen', () => {
  expect(matchesStatus(open, noFilter)).toBe(true);
  expect(matchesStatus(closed, noFilter)).toBe(false);
  expect(matchesStatus(both, noFilter)).toBe(true);
});

test('shows only what the status filter asks for', () => {
  const closedOnly = { status: ['closed'], instrument: [] };
  expect(matchesStatus(closed, closedOnly)).toBe(true);
  expect(matchesStatus(open, closedOnly)).toBe(false);
  expect(matchesStatus(both, closedOnly)).toBe(true);
});

test('choosing both statuses shows everything', () => {
  const all = { status: ['open', 'closed'], instrument: [] };
  expect(matchesStatus(open, all)).toBe(true);
  expect(matchesStatus(closed, all)).toBe(true);
});

test('keeps a closed position visible when that instrument is picked directly', () => {
  expect(matchesStatus(closed, { status: [], instrument: ['mutual_funds|NA|127042'] })).toBe(true);
});
