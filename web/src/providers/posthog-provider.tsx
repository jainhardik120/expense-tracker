'use client';

import { useEffect } from 'react';

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
