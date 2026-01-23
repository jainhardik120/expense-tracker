'use client';

import { useEffect } from 'react';

import { useCookies } from 'next-client-cookies';

import { TIME_OFFSET_COOKIE, TIMEZONE_COOKIE } from '@/types';

const TimeZoneSetter = () => {
  const cookies = useCookies();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const existing = cookies.get(TIMEZONE_COOKIE);
    if (existing === undefined || existing !== tz) {
      const offset = new Date().getTimezoneOffset();
      cookies.set(TIMEZONE_COOKIE, tz, { expires: 30, path: '/' });
      cookies.set(TIME_OFFSET_COOKIE, offset.toString(), { expires: 30, path: '/' });
      globalThis.location.reload();
    }
  }, [cookies]);

  return null;
};

export const useTimezone = () => {
  const cookieStore = useCookies();
  return cookieStore.get(TIMEZONE_COOKIE) ?? 'UTC';
};

export default TimeZoneSetter;
