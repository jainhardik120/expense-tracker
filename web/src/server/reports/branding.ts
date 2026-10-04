import { localWallClock } from '@/lib/date';

import type { ReportBranding } from '@helix-hq/pdf-report';

const PRIMARY = '#ec003f';

const CHART_PALETTE = [
  PRIMARY,
  '#2563eb',
  '#f59e0b',
  '#7c3aed',
  '#059669',
  '#0891b2',
  '#db2777',
  '#ca8a04',
  '#475569',
] as const;

export const reportBranding = (
  subtitle: string,
  timezone: string,
  title = 'Money report',
): ReportBranding => ({
  title,
  subtitle,
  generatedAt: localWallClock(new Date(), timezone).replace('T', ' '),
  wordmark: 'EXPENSE TRACKER',
  showMark: false,
  accent: PRIMARY,
  chartPalette: CHART_PALETTE,
});
