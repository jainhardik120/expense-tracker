/**
 * Durations in whole seconds.
 *
 * Cookie `max-age` and a few other browser APIs are denominated in seconds, not
 * milliseconds, so they cannot reuse the MS_PER_* constants in `@/types`. This
 * module deliberately has no imports: `sidebar.ts` is read by the root layout on
 * the server and should not pull the schema barrel in behind it.
 */
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const DAYS_PER_YEAR = 365;

export const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
export const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;
export const SECONDS_PER_WEEK = SECONDS_PER_DAY * DAYS_PER_WEEK;
export const SECONDS_PER_YEAR = SECONDS_PER_DAY * DAYS_PER_YEAR;
