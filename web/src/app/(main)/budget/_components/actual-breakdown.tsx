'use client';

import { CalculationDetails } from '@/components/calculation-details';
import type { CalcRow } from '@/components/help/help-visuals';
import { formatCurrency } from '@/lib/format';
import type { YearDetail } from '@/types/router-outputs';

const PAISE_PER_RUPEE = 100;

export const ActualBreakdown = ({
  name,
  actual,
  groups,
}: {
  name: string;
  actual: number;
  groups: YearDetail['actualsByLine'][string];
}) => {
  const rows: CalcRow[] = groups.map((group) => {
    const count = `${group.count} ${group.count === 1 ? 'payment' : 'payments'}`;
    return {
      key: group.key,
      label: group.unitAmount === undefined ? group.label : formatCurrency(group.unitAmount),
      note: group.unitAmount === undefined ? count : `× ${count}`,
      value: group.amount,
    };
  });
  const displayed = rows.reduce(
    (sum, row) => sum + Math.round(Number(row.value) * PAISE_PER_RUPEE),
    0,
  );
  const rounding = Math.round(actual * PAISE_PER_RUPEE) - displayed;
  if (rounding !== 0) {
    rows.push({ key: 'rounding', label: 'Rounding adjustment', value: rounding / PAISE_PER_RUPEE });
  }

  return (
    <CalculationDetails
      result={{ label: 'Actual', value: actual }}
      rows={rows}
      title={`${name}: actual`}
      trigger={
        <button
          aria-label={`${name}: actual`}
          className="cursor-help rounded-sm underline-offset-4 hover:underline"
          type="button"
        >
          {formatCurrency(actual)}
        </button>
      }
    />
  );
};
