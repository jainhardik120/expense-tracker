/**
 * Which slice of spending the dashboard's expenses chart opens on.
 *
 * Most days the question is not "what did I spend" but "how is the one line I
 * actually control doing" -- day-to-day living, with rent and loans and the
 * flight home taken out. That choice is remembered so the answer is already on
 * screen rather than two clicks away.
 *
 * A cookie rather than localStorage, for the same reason the page size is one:
 * the page is rendered on the server, so it has to know before it renders or
 * the chart arrives showing everything and then swaps.
 */
import { SECONDS_PER_YEAR } from '@/lib/duration';

export const CHART_SCOPE_COOKIE = 'dashboard-chart-scope';

/** The scope meaning "no budget line -- every expense there is". */
export const ALL_EXPENSES = 'all';

const COOKIE_MAX_AGE = SECONDS_PER_YEAR;

/**
 * A stored scope, or `ALL_EXPENSES` when there is nothing usable.
 *
 * Whether the id still names a line is not decided here: lines are deleted, and
 * the page checks the value against the lines it actually loaded.
 */
export const parseChartScope = (raw: string | undefined): string =>
  raw === undefined || raw === '' ? ALL_EXPENSES : raw;

export const writeChartScopeCookie = (scope: string): void => {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${CHART_SCOPE_COOKIE}=${scope}; path=/; max-age=${String(COOKIE_MAX_AGE)}; samesite=lax`;
};
