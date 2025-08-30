'use client';

import type * as React from 'react';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export const ThemeProvider = ({
  children,
  ...props
}: Readonly<React.ComponentProps<typeof NextThemesProvider>>) => (
  <NextThemesProvider {...props}>{children}</NextThemesProvider>
);
