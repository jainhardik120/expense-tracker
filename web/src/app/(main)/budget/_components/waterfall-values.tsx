'use client';

import { CalculationDetails } from '@/components/calculation-details';
import { formatCurrency } from '@/lib/format';
import type { YearDetail } from '@/types/router-outputs';

import { CommittedBreakdown } from './committed-breakdown';
import { YearBudgetBreakdown } from './line-breakdown';

type ProjectedLine = YearDetail['projection']['lines'][number];
type ValueRow = Pick<
  ProjectedLine,
  'name' | 'yearBudget' | 'actual' | 'committed' | 'remaining' | 'overspent'
> & {
  allocationKind: string;
  projected: ProjectedLine | undefined;
};

const residualNote = (row: ValueRow, field: 'committed' | 'remaining'): string => {
  if (field === 'committed') {
    if (row.committed > 0) {
      return 'This is the amount we are already short by after reducing the investment goal to cover overspending elsewhere.';
    }
    return row.committed === 0
      ? 'The investment goal matches the year budget, so there is no shortfall yet.'
      : 'The investment goal is above the year budget; the negative difference is an additional investment target.';
  }
  if (row.remaining > 0) {
    return 'This is how much more we need to invest to reach the reduced investment goal.';
  }
  return row.remaining === 0
    ? 'We have reached the reduced investment goal.'
    : 'We have invested more than the reduced investment goal; the negative amount is how much we are ahead.';
};

export const WaterfallValue = ({
  row,
  field,
}: {
  row: ValueRow;
  field: 'committed' | 'remaining';
}) => {
  const isCommitted = field === 'committed';
  const value = isCommitted && row.committed === 0 ? '--' : formatCurrency(row[field]);
  let className;
  if (isCommitted) {
    className = 'text-muted-foreground';
  } else if (row.overspent) {
    className = 'text-destructive';
  }
  if (row.allocationKind !== 'residual') {
    return <span className={className}>{value}</span>;
  }

  const goal = row.projected?.allocationAmount ?? 0;
  const title = isCommitted ? 'Investment shortfall' : 'Remaining to invest';

  return (
    <CalculationDetails
      note={residualNote(row, field)}
      result={{ label: isCommitted ? 'Difference' : 'Remaining to invest', value: row[field] }}
      rows={[
        {
          label: isCommitted ? 'Year budget' : 'Reduced investment goal',
          value: isCommitted ? row.yearBudget : goal,
        },
        {
          label: isCommitted ? 'Reduced investment goal' : 'Already invested',
          value: -(isCommitted ? goal : row.actual),
        },
      ]}
      title={title}
      trigger={
        <button
          aria-label={`${row.name}: ${title.toLowerCase()}`}
          className={`cursor-help rounded-sm underline-offset-4 hover:underline ${className ?? ''}`}
          type="button"
        >
          {value}
        </button>
      }
    />
  );
};

export const YearBudgetValue = ({
  row,
  projection,
}: {
  row: ValueRow;
  projection: YearDetail['projection'];
}) => {
  if (row.projected === undefined) {
    return <span className="text-muted-foreground">{formatCurrency(row.yearBudget)}</span>;
  }

  return (
    <YearBudgetBreakdown
      line={row.projected}
      projection={projection}
      trigger={
        <button
          aria-label={`${row.name}: year budget`}
          className="text-muted-foreground cursor-help rounded-sm underline-offset-4 hover:underline"
          type="button"
        >
          {formatCurrency(row.yearBudget)}
        </button>
      }
    />
  );
};

export const CommittedValue = ({
  row,
  payments,
}: {
  row: ValueRow;
  payments: YearDetail['commitmentsByLine'][string];
}) =>
  row.allocationKind === 'residual' ? (
    <WaterfallValue field="committed" row={row} />
  ) : (
    <CommittedBreakdown committed={row.committed} name={row.name} payments={payments} />
  );
