import { SECONDS_PER_YEAR } from '@/lib/duration';

export const CHART_SCOPE_COOKIE = 'dashboard-chart-scope';

export const ALL_EXPENSES = 'all';

const COOKIE_MAX_AGE = SECONDS_PER_YEAR;

export const parseChartScope = (raw: string | undefined): string =>
  raw === undefined || raw === '' ? ALL_EXPENSES : raw;

export const writeChartScopeCookie = (scope: string): void => {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${CHART_SCOPE_COOKIE}=${scope}; path=/; max-age=${String(COOKIE_MAX_AGE)}; samesite=lax`;
};
