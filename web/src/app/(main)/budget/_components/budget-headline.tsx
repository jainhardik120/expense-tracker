'use client';

import { useState } from 'react';

import { format, parse, setDate } from 'date-fns';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cycleAllowance } from '@/lib/budget-projection';
import { formatCurrency, DATE_FORMAT } from '@/lib/format';
import type { YearDetail } from '@/types/router-outputs';

import { GoalEditor } from './goal-editor';
import { LeftBreakdown } from './left-breakdown';

const DAYS_PER_MONTH = 30.4;

const OVERDRAWN = 'text-red-600';
const MUTED = 'text-muted-foreground';
const UNDER_PACE = 'text-green-600';

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
    <span className={strong ? '' : MUTED}>
      {label}
      {note === undefined ? null : (
        <span className="text-muted-foreground/70 ml-2 text-xs">{note}</span>
      )}
    </span>
    <span className={`tabular-nums ${value < 0 ? OVERDRAWN : ''}`}>{formatCurrency(value)}</span>
  </div>
);

const Scenario = ({
  label,
  perMonth,
  invested,
  goal,
  highlight = false,
}: {
  label: string;
  perMonth: number;
  invested: number;
  goal: number;
  highlight?: boolean;
}) => {
  const against = invested - goal;
  return (
    <TableRow className={highlight ? 'bg-muted/50' : ''}>
      <TableCell className={highlight ? 'font-semibold' : 'font-medium'}>{label}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(perMonth)}</TableCell>
      <TableCell className="text-muted-foreground text-right tabular-nums">
        {formatCurrency(perMonth / DAYS_PER_MONTH)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(invested)}
        <span className={`ml-2 text-xs ${against < 0 ? OVERDRAWN : MUTED}`}>
          {against < 0 ? `${formatCurrency(-against)} short` : 'on target'}
        </span>
      </TableCell>
    </TableRow>
  );
};

const NAMES_SHOWN = 3;

const listNames = (names: string[]): string =>
  names.length <= NAMES_SHOWN
    ? names.join(', ')
    : `${names.slice(0, NAMES_SHOWN).join(', ')} and ${String(names.length - NAMES_SHOWN)} more`;

const describeLines = (lines: YearDetail['projection']['lines']) => {
  const living = lines.filter((line) => line.discretionary && line.allocationKind === 'monthly');
  return {
    promised: lines
      .filter(
        (line) =>
          line.allocationKind !== 'residual' &&
          !living.includes(line) &&
          line.forecastRemaining !== 0,
      )
      .map((line) => line.name),
    living: living.map((line) => line.name),
    residual: lines.find((line) => line.allocationKind === 'residual')?.name ?? null,
  };
};

const restSentence = (
  named: ReturnType<typeof describeLines>,
  livingAmount: number,
  hasLines: boolean,
): string => {
  if (!hasLines) {
    return 'There are no budget lines yet, so nothing is promised or planned. Add lines, or copy them from another year.';
  }
  const spentOn = named.living.length === 0 ? 'day-to-day spending' : listNames(named.living);
  const rest = named.residual === null ? 'is not given to any line' : `goes to ${named.residual}`;
  return `Carrying on as you are, ${formatCurrency(livingAmount)} of that goes on ${spentOn} and the rest ${rest}.`;
};

export const BudgetHeadline = ({ detail }: { detail: YearDetail }) => {
  const {
    projection,
    balanceToday,
    incomeCyclesRemaining,
    pendingCounted,
    pendingSpend,
    pendingCount,
    thisCycle: savedCycle,
  } = detail;
  const {
    goal: savedGoal,
    affordable,
    investedSoFar,
    projectedAtPace,
    projectedAtBudget,
    commitmentsRemaining,
    discretionaryRemaining,
    pacePerMonth,
    budgetPerMonth,
    unrecordedSpend,
  } = projection;

  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState<number | null>(null);
  const previewing = draftGoal !== null && (editing || draftGoal !== savedGoal);
  const goal = previewing ? draftGoal : savedGoal;
  const thisCycle = !previewing
    ? savedCycle
    : {
        ...savedCycle,
        ...cycleAllowance({
          affordable: affordable + savedGoal - draftGoal,
          ...savedCycle.allowanceInputs,
        }),
      };
  const noLivingAbove = savedGoal + affordable + savedCycle.allowanceInputs.spent;

  const months = projection.spendMonths;
  const incomeRemaining = pendingCounted;
  const { keptOutside } = detail;
  const totalAvailable = balanceToday - pendingSpend + incomeRemaining - keptOutside;
  const leftToSpendOrInvest = totalAvailable - commitmentsRemaining;
  const { daysLeftInYear, pendingIncome } = detail;
  const named = describeLines(projection.lines);
  const incomeNote =
    pendingIncome.payments > 0 && incomeRemaining === 0
      ? `${String(pendingIncome.payments)} salaries expected, but no income line counts them yet`
      : `${String(incomeCyclesRemaining)} salaries`;
  const goalRemaining = Math.max(savedGoal - investedSoFar, 0);
  const leftForLiving = leftToSpendOrInvest - goalRemaining;
  const cycleOpened = format(
    setDate(parse(thisCycle.key, 'yyyy-MM', new Date()), detail.year.startDate.getUTCDate()),
    DATE_FORMAT.day,
  );
  const cycleCloses = format(thisCycle.endsOn, DATE_FORMAT.day);
  const paceColour = thisCycle.spent > thisCycle.onPace ? OVERDRAWN : UNDER_PACE;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            What is left for the rest of the year
            <LeftBreakdown detail={detail} />
          </CardTitle>
          <CardDescription>
            {months.toFixed(1)} months ({daysLeftInYear} {daysLeftInYear === 1 ? 'day' : 'days'})
            left to spend in, {incomeCyclesRemaining} more salaries. Everything already promised
            comes off first.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Row label="Balance today" value={balanceToday} />
          {pendingCount === 0 ? null : (
            <Row
              label="Spent but not entered yet"
              note={`${pendingCount} messages waiting`}
              value={-pendingSpend}
            />
          )}
          <Row label="Income still to come" note={incomeNote} value={incomeRemaining} />
          {keptOutside === 0 ? null : (
            <Row
              label="Kept outside the budget"
              note="income set to stay out of the plan"
              value={-keptOutside}
            />
          )}
          <Row label="Total available" rule strong value={totalAvailable} />

          <div className="h-2" />
          <Row
            label="Everything already promised"
            note={named.promised.length === 0 ? 'nothing yet' : listNames(named.promised)}
            value={-commitmentsRemaining}
          />
          <Row label="Left to spend or invest" rule strong value={leftToSpendOrInvest} />
          <p className="text-muted-foreground pt-2 text-xs">
            {restSentence(named, discretionaryRemaining, projection.lines.length > 0)}
          </p>

          <div className="h-2" />
          <Row
            label="Still to invest for your goal"
            note={`${formatCurrency(investedSoFar)} of ${formatCurrency(savedGoal)} done`}
            value={-goalRemaining}
          />
          <Row label="Left for living" rule strong value={leftForLiving} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How much can I spend?</CardTitle>
          <CardDescription>
            The same {months.toFixed(1)} months read three ways. The last row is the one to follow
            if {formatCurrency(goal)} invested is the point.
          </CardDescription>
          {editing ? null : (
            <CardAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraftGoal(savedGoal);
                  setEditing(true);
                }}
              >
                <Pencil />
                Edit goal
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {editing && draftGoal !== null ? (
            <GoalEditor
              budgetYearId={detail.year.id}
              draft={draftGoal}
              goal={savedGoal}
              investedSoFar={investedSoFar}
              noLivingAbove={noLivingAbove}
              onDone={(saved) => {
                setEditing(false);
                if (!saved) {
                  setDraftGoal(null);
                }
              }}
              onDraftChange={setDraftGoal}
            />
          ) : null}
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">To reach your goal, spend at most</p>
            <p className="text-3xl font-semibold">
              {formatCurrency(thisCycle.perMonth)}
              <span className="text-muted-foreground ml-1 text-sm font-normal">/month</span>
            </p>
            <p className="text-muted-foreground/70 text-xs">
              Set on {cycleOpened}, holds until {cycleCloses}
            </p>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 border-t pt-3">
              <p className="text-muted-foreground text-xs">Left this month</p>
              <p
                className={`text-xl font-semibold tabular-nums ${
                  thisCycle.remaining < 0 ? OVERDRAWN : ''
                }`}
              >
                {formatCurrency(thisCycle.remaining)}
              </p>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-muted-foreground/70 text-xs">
                <span
                  className={`font-semibold ${paceColour}`}
                  title={`An even pace would have spent ${formatCurrency(thisCycle.onPace)} by today`}
                >
                  {formatCurrency(thisCycle.recorded)}
                </span>{' '}
                spent since {cycleOpened}, averaging{' '}
                <span className={`font-semibold ${paceColour}`}>
                  {formatCurrency(thisCycle.spentPerDay)}/day
                </span>
                {thisCycle.spent > thisCycle.recorded
                  ? `, ${formatCurrency(thisCycle.spent - thisCycle.recorded)} more waiting in messages`
                  : ''}
              </p>
              <p className={`text-sm tabular-nums ${thisCycle.perDay < 0 ? OVERDRAWN : MUTED}`}>
                {formatCurrency(thisCycle.perDay)}
                <span className="ml-1 text-xs">
                  /day for {thisCycle.daysLeft} {thisCycle.daysLeft === 1 ? 'day' : 'days'}
                </span>
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>If you spend</TableHead>
                <TableHead className="text-right">Per month</TableHead>
                <TableHead className="text-right">Per day</TableHead>
                <TableHead className="text-right">You end the year with</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Scenario
                goal={goal}
                invested={projectedAtPace}
                label="At the rate you are going"
                perMonth={pacePerMonth}
              />
              <Scenario
                goal={goal}
                invested={projectedAtBudget}
                label="At the budget you set"
                perMonth={budgetPerMonth}
              />
              <Scenario
                goal={goal}
                highlight
                invested={goal}
                label="To hit your goal"
                perMonth={thisCycle.perMonth}
              />
            </TableBody>
          </Table>

          <p className="text-muted-foreground text-xs">
            Already invested {formatCurrency(investedSoFar)}.
            {unrecordedSpend > 0
              ? ` Includes ${formatCurrency(unrecordedSpend)} spent but not yet entered.`
              : ''}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
