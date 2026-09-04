'use client';

import { useCallback } from 'react';

import { format as formatDate } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import { useTimezone } from '@/components/time-zone-setter';

/**
 * Formats stored instants in the timezone the app is configured for.
 *
 * `format(date, …)` from date-fns renders in whatever zone the browser happens
 * to be in. That usually matches, and silently does not when someone is
 * travelling or has set the timezone deliberately — and the app already keeps a
 * timezone for exactly this purpose, so half the screens honouring it and half
 * reading the browser is the kind of difference nobody notices until two pages
 * disagree about which day something happened.
 */
export type ZonedFormat = (date: Date | string | null | undefined, pattern: string) => string;

export const useZonedFormat = (): ZonedFormat => {
  const timezone = useTimezone();
  // Stable while the timezone is, so callers can keep it out of a `useMemo`
  // dependency list without the memo going stale.
  return useCallback(
    (date: Date | string | null | undefined, pattern: string): string => {
      if (date === null || date === undefined) {
        return '-';
      }
      const value = typeof date === 'string' ? new Date(date) : date;
      return formatDate(toZonedTime(value, timezone), pattern);
    },
    [timezone],
  );
};
