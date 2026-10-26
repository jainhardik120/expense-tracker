'use client';

import { CalculationDetails } from '@/components/calculation-details';
import type { CalcRow } from '@/components/help/help-visuals';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import type { YearDetail } from '@/types/router-outputs';

type PendingPayment = YearDetail['commitmentsByLine'][string][number];

const VISIBLE_PAYMENTS = 3;
const PAISE_PER_RUPEE = 100;

const total = (payments: PendingPayment[]) =>
  payments.reduce((sum, payment) => sum + payment.myShare, 0);

export const CommittedBreakdown = ({
  name,
  committed,
  payments,
}: {
  name: string;
  committed: number;
  payments: PendingPayment[];
}) => {
  const zoned = useZonedFormat();
  const groups = new Map<string, PendingPayment[]>();
  for (const payment of payments) {
    const group = groups.get(payment.emiId) ?? [];
    group.push(payment);
    groups.set(payment.emiId, group);
  }

  const rows: CalcRow[] = [];
  if (groups.size > 1) {
    for (const group of groups.values()) {
      const overdue = group.filter((payment) => payment.status === 'missed').length;
      const overdueNote = overdue > 0 ? `; ${overdue} overdue` : '';
      rows.push({
        label: `${group[0].emiName} · ${group[0].cardName}`,
        note: `${group.length} payments${overdueNote}`,
        value: total(group),
      });
    }
  } else {
    const ordered = [...payments].sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const payment of ordered.slice(0, VISIBLE_PAYMENTS)) {
      const installment = payment.installment === 0 ? 'Fees' : `#${payment.installment}`;
      rows.push({
        label: `${payment.emiName} · ${installment}`,
        note: `${zoned(payment.date, DATE_FORMAT.date)}${payment.status === 'missed' ? ' · overdue' : ''}`,
        value: payment.myShare,
      });
    }
    const rest = ordered.slice(VISIBLE_PAYMENTS);
    if (rest.length > 0) {
      const overdue = rest.filter((payment) => payment.status === 'missed').length;
      rows.push({
        label: `Remaining ${rest.length} payments`,
        note: overdue > 0 ? `${overdue} overdue` : undefined,
        value: total(rest),
      });
    }
  }

  const displayedTotal = rows.reduce(
    (sum, row) => sum + Math.round(Number(row.value) * PAISE_PER_RUPEE),
    0,
  );
  const rounding = Math.round(committed * PAISE_PER_RUPEE) - displayedTotal;
  if (rounding !== 0) {
    rows.push({ label: 'Rounding adjustment', value: rounding / PAISE_PER_RUPEE });
  }

  const overdue = total(payments.filter((payment) => payment.status === 'missed'));
  const overdueNote = overdue > 0 ? `${formatCurrency(overdue)} is already overdue. ` : '';
  return (
    <CalculationDetails
      note={
        payments.length === 0
          ? 'No unpaid EMI payments are assigned to this line in the budget year. Recurring schedules and monthly allocations are not included in Committed.'
          : `Your share of unpaid EMI payments within the budget year, including interest, GST and fees. ${overdueNote}Recurring schedules and monthly allocations are not included.`
      }
      result={{ label: 'Committed', value: committed }}
      rows={rows}
      title={`${name}: committed payments`}
      trigger={
        <button
          aria-label={`${name}: committed payments`}
          className="text-muted-foreground cursor-help rounded-sm underline-offset-4 hover:underline"
          type="button"
        >
          {committed === 0 ? '--' : formatCurrency(committed)}
        </button>
      }
    />
  );
};
