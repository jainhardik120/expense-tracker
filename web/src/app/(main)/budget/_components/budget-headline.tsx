'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';

type Detail = RouterOutput['budget']['getYearDetail'];

const DAYS_PER_MONTH = 30.4;

const Row = ({
  label,
  value,
  note,
  strong = false,
  rule = false,
}: {
  label: string;
  value: number;
  note?: string;
  strong?: boolean;
  rule?: boolean;
}) => (
  <div
    className={`flex items-baseline justify-between gap-4 py-1 ${rule ? 'border-t pt-2' : ''} ${
      strong ? 'font-semibold' : ''
    }`}
  >
    <span className={strong ? '' : 'text-muted-foreground'}>
      {label}
      {note === undefined ? null : (
        <span className="text-muted-foreground/70 ml-2 text-xs">{note}</span>
      )}
    </span>
    <span className={`tabular-nums ${value < 0 ? 'text-red-600' : ''}`}>
      {formatCurrency(value)}
    </span>
  </div>
);

export const BudgetHeadline = ({ detail }: { detail: Detail }) => {
  const { projection, balanceToday, incomeCyclesRemaining, monthlyIncome } = detail;
  const {
    goal,
    investedSoFar,
    projectedAtPace,
    projectedAtBudget,
    commitmentsRemaining,
    discretionaryRemaining,
    safeToSpendPerMonth,
  } = projection;

  const months = projection.spendMonths;
  const incomeRemaining = monthlyIncome * incomeCyclesRemaining;
  const leftToSpendOrInvest = balanceToday + incomeRemaining - commitmentsRemaining;
  const perDay = safeToSpendPerMonth / DAYS_PER_MONTH;
  const shortfall = goal - projectedAtBudget;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>What is left for the rest of the year</CardTitle>
          <CardDescription>
            {months.toFixed(1)} months left to spend in, {incomeCyclesRemaining} more salaries.
            Everything already promised comes off first.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Row label="Balance today" value={balanceToday} />
          <Row
            label="Income still to come"
            note={`${incomeCyclesRemaining} salaries`}
            value={incomeRemaining}
          />
          <Row label="Total available" rule strong value={balanceToday + incomeRemaining} />

          <div className="h-2" />
          <Row
            label="Everything already promised"
            note="rent, money home, loans, flights"
            value={-commitmentsRemaining}
          />
          <Row label="Left to spend or invest" rule strong value={leftToSpendOrInvest} />
          <p className="text-muted-foreground pt-2 text-xs">
            Carrying on as you are, {formatCurrency(discretionaryRemaining)} of that goes on living
            and the rest is invested.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Safe to spend</CardTitle>
          <CardDescription>
            Spend this much a month and you land on {formatCurrency(goal)} invested.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Per month, {months.toFixed(1)} left</p>
              <p className="text-3xl font-semibold">{formatCurrency(safeToSpendPerMonth)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Per day</p>
              <p className="text-3xl font-semibold">{formatCurrency(perDay)}</p>
            </div>
          </div>

          <div className="text-sm">
            <Row label="Already invested" value={investedSoFar} />
            <Row label="At your current pace" value={projectedAtPace} />
            <Row label="If you stick to budget" value={projectedAtBudget} />
            <Row label="Goal" rule strong value={goal} />
            <p className={`pt-1 text-xs ${shortfall > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {shortfall > 0
                ? `On budget you finish ${formatCurrency(shortfall)} short.`
                : `On budget you finish ${formatCurrency(-shortfall)} ahead.`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
