'use client';

import { useEffect } from 'react';

/**
 * Analytics, started once the page is up.
 *
 * It always initialised after hydration, in an effect; now the library itself
 * is fetched there too, so its ~150 KB is no longer part of the JavaScript
 * every page has to parse before it becomes interactive. Nothing reads the
 * PostHog React context, so the provider it used to render is not needed.
 */
export const PostHogProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    void import('posthog-js').then(({ posthog }) =>
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        defaults: '2025-11-30',
      }),
    );
  }, []);

  return <>{children}</>;
};
