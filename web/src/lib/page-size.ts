/**
 * The page size you last chose for a table, remembered across visits.
 *
 * A cookie rather than localStorage: the server has to know the size before it
 * renders, so it can redirect to the right URL in one pass. Seeding it from the
 * client meant every arrival rendered at the default size and then replaced the
 * URL, refetching the page you had just been given.
 *
 * The URL stays the single source of truth -- that is what keeps a filtered
 * table linkable -- and the cookie only decides where an unparameterised visit
 * lands.
 */
import { SECONDS_PER_YEAR } from '@/lib/duration';

const COOKIE_PREFIX = 'page-size.';

/** Table keys that opt in to remembering their page size. */
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
