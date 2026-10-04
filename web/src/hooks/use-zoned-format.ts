'use client';

import { useCallback } from 'react';

import { format as formatDate } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import { useTimezone } from '@/components/time-zone-setter';

export type ZonedFormat = (date: Date | string | null | undefined, pattern: string) => string;

export const useZonedFormat = (): ZonedFormat => {
  const timezone = useTimezone();
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
