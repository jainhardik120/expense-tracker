'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';

type Projection = RouterOutput['budget']['getYearDetail']['projection'];

const DAYS_PER_MONTH = 30.4;

export const BudgetHeadline = ({ projection }: { projection: Projection }) => {
  const { lines, remainingMonths, projectedResidual, residualGoal } = projection;

  // Only the capped lines you can actually decide about. Rent and money sent
  // home have budget left every month too, but it is already spoken for.
  const pace = lines.filter(
    (line) =>
      line.discretionary && (line.allocationKind === 'monthly' || line.allocationKind === 'annual'),
  );
  const leftToSpend = pace.reduce((sum, line) => sum + Math.max(line.remaining, 0), 0);
  const perMonth = remainingMonths > 0 ? leftToSpend / remainingMonths : leftToSpend;
  const perDay = perMonth / DAYS_PER_MONTH;
  const shortfall = residualGoal - projectedResidual;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Safe to spend</CardTitle>
        <CardDescription>
          What is left across your capped lines, paced over the {remainingMonths.toFixed(1)} months
          still to run.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Left to spend</p>
          <p className="text-2xl font-semibold">{formatCurrency(leftToSpend)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Per month</p>
          <p className="text-2xl font-semibold">{formatCurrency(perMonth)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Per day</p>
          <p className="text-2xl font-semibold">{formatCurrency(perDay)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">On track to save</p>
          <p className="text-2xl font-semibold">{formatCurrency(projectedResidual)}</p>
          <p className={`text-xs ${shortfall > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {shortfall > 0
              ? `${formatCurrency(shortfall)} short of ${formatCurrency(residualGoal)}`
              : `${formatCurrency(-shortfall)} ahead of ${formatCurrency(residualGoal)}`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
