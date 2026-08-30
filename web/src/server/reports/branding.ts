import type { ReportBranding } from '@helix-hq/pdf-report';

// react-pdf cannot read CSS custom properties and does not understand oklch, so
// the app's tokens are carried here as sRGB hex. --primary converted exactly;
// keep it in step with src/app/globals.css by hand.
const PRIMARY = '#ec003f';

// The app's --chart-1..5 are all shades of the same rose, which reads fine on a
// two or three series dashboard chart and turns a twelve-slice pie into one
// indistinguishable smear. So the brand colour leads and the rest are chosen for
// adjacent contrast instead.
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

/** Branding stamped on every report this app renders. */
export const reportBranding = (subtitle: string, title = 'Money report'): ReportBranding => ({
  title,
  subtitle,
  generatedAt: new Date().toUTCString(),
  wordmark: 'EXPENSE TRACKER',
  // The package's own glyph is the Helix double strand; this app is not Helix.
  showMark: false,
  accent: PRIMARY,
  chartPalette: CHART_PALETTE,
});
