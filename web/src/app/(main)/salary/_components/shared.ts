import { formatCurrency } from '@/lib/format';
import type { RouterOutput } from '@/server/routers';

export type SalaryData = RouterOutput['salary']['getPageData'];
export type SalaryRow = SalaryData['rows'][number];
export type SalaryComponent = SalaryData['components'][number];
export type SalaryRevision = SalaryData['revisions'][number];

export const classificationLabels = {
  regular: 'Regular',
  tax_withholding: 'TDS / tax withheld',
  provident_fund: 'Provident fund',
  other: 'Other',
};

export const statusPresentation = {
  actual: { label: 'Actual', variant: 'default' as const },
  forecast: { label: 'Forecast', variant: 'secondary' as const },
  awaiting: { label: 'Awaiting link', variant: 'outline' as const },
};

export const formatSignedCurrency = (value: number) =>
  `${value >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(value))}`;

export const formatPeriod = (periodStart: Date) =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    periodStart,
  );

export const formatSlabRange = (lower: number, upper: number | null) => {
  if (lower === 0 && upper !== null) {
    return `Up to ${formatCurrency(upper)}`;
  }
  if (upper === null) {
    return `Above ${formatCurrency(lower)}`;
  }
  return `Above ${formatCurrency(lower)} up to ${formatCurrency(upper)}`;
};

/** How much of a row's TDS comes from an adjustment rather than the payslip. */
export const tdsAdjustment = (
  row: SalaryRow,
  kind: 'bonus_tds' | 'year_end_reconciliation',
): number =>
  row.components.reduce(
    (total, component) =>
      'forecastAdjustment' in component && component.forecastAdjustment === kind
        ? total + component.amount
        : total,
    0,
  );

const NOON = 12;

/**
 * A date that means a calendar day, pinned to noon UTC.
 *
 * Effective dates, pay dates and expected dates are days rather than instants,
 * and noon is far enough from both midnights that no reader's timezone shifts
 * them onto the day before or after.
 */
export const asCalendarDay = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), NOON));

export const DEFAULT_PAY_DAY = 25;

export const getProjectedTdsPositionLabel = (position: number) => {
  if (position === 0) {
    return 'Projected TDS matches tax';
  }
  return position > 0 ? 'Estimated TDS surplus' : 'Estimated tax shortfall';
};
