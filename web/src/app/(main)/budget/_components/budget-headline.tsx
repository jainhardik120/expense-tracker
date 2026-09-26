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
  const { outlook } = detail;
  const months = outlook.monthsRemaining;
  const perDay = outlook.safeToSpendPerMonth / DAYS_PER_MONTH;
  const onTrack = outlook.atBudgetPace.yearTotal >= outlook.investmentGoal;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>What is left for the rest of the year</CardTitle>
          <CardDescription>
            {months.toFixed(1)} months left to spend in, {outlook.incomeCyclesRemaining} more
            salaries. Everything already promised comes off first.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Row label="Balance today" value={outlook.totalAvailable - outlook.incomeRemaining} />
          <Row
            label="Income still to come"
            note={`${outlook.incomeCyclesRemaining} salaries`}
            value={outlook.incomeRemaining}
          />
          <Row label="Total available" rule strong value={outlook.totalAvailable} />

          <div className="h-2" />
          <Row
            label="Rent and money home"
            note={`${outlook.incomeCyclesRemaining} months`}
            value={-outlook.fixedRemaining}
          />
          <Row label="Loan installments left" value={-outlook.emiRemaining} />
          <Row
            label="Set aside for flights"
            note="one more trip home"
            value={-outlook.envelopesRemaining}
          />
          <Row label="Left to spend or invest" rule strong value={outlook.afterCommitments} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Safe to spend</CardTitle>
          <CardDescription>
            Spend this much a month and you still hit {formatCurrency(outlook.investmentGoal)}{' '}
            invested.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Per month, {months.toFixed(0)} left</p>
              <p className="text-3xl font-semibold">
                {formatCurrency(outlook.safeToSpendPerMonth)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Per day</p>
              <p className="text-3xl font-semibold">{formatCurrency(perDay)}</p>
            </div>
          </div>

          <div className="text-sm">
            <Row label="Already invested" value={outlook.investedSoFar} />
            <Row label="At your current pace" value={outlook.atCurrentPace.yearTotal} />
            <Row label="If you stick to budget" value={outlook.atBudgetPace.yearTotal} />
            <Row label="Goal" rule strong value={outlook.investmentGoal} />
            <p className={`pt-1 text-xs ${onTrack ? 'text-green-600' : 'text-red-600'}`}>
              {onTrack
                ? `On budget you finish ${formatCurrency(outlook.atBudgetPace.yearTotal - outlook.investmentGoal)} ahead.`
                : `On budget you finish ${formatCurrency(outlook.investmentGoal - outlook.atBudgetPace.yearTotal)} short.`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
