import { SECONDS_PER_YEAR } from '@/lib/duration';

const COOKIE_PREFIX = 'page-size.';

export const STATEMENTS_PAGE_SIZE_KEY = 'statements';
const COOKIE_MAX_AGE = SECONDS_PER_YEAR;

export const pageSizeCookieName = (key: string): string => `${COOKIE_PREFIX}${key}`;

export const parsePageSize = (raw: string | undefined): number | null => {
  if (raw === undefined) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const writePageSizeCookie = (key: string, pageSize: number): void => {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${pageSizeCookieName(key)}=${pageSize}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
};
