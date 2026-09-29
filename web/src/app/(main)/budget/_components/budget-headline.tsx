'use client';

import { format, parse, setDate } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';

import { LeftBreakdown } from './left-breakdown';

type Detail = RouterOutput['budget']['getYearDetail'];

const DAYS_PER_MONTH = 30.4;

/** Figures below zero are the ones worth noticing, wherever they appear. */
const OVERDRAWN = 'text-red-600';

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
    <span className={`tabular-nums ${value < 0 ? OVERDRAWN : ''}`}>
      {formatCurrency(value)}
    </span>
  </div>
);

/** One way of spending the rest of the year, and where it leaves you. */
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
        <span className={`ml-2 text-xs ${against < 0 ? OVERDRAWN : 'text-muted-foreground'}`}>
          {against < 0 ? `${formatCurrency(-against)} short` : 'on target'}
        </span>
      </TableCell>
    </TableRow>
  );
};

export const BudgetHeadline = ({ detail }: { detail: Detail }) => {
  const {
    projection,
    balanceToday,
    incomeCyclesRemaining,
    pendingCounted,
    pendingSpend,
    pendingCount,
    thisCycle,
  } = detail;
  const {
    goal,
    investedSoFar,
    projectedAtPace,
    projectedAtBudget,
    commitmentsRemaining,
    discretionaryRemaining,
    safeToSpendPerMonth,
    pacePerMonth,
    budgetPerMonth,
    unrecordedSpend,
  } = projection;

  const months = projection.spendMonths;
  // Read off the payroll schedule, not averaged out of past payslips: a raise
  // in November is invisible to an average until November.
  const incomeRemaining = pendingCounted;
  // The balance is behind by whatever is still sitting in the message queue.
  const leftToSpendOrInvest = balanceToday - pendingSpend + incomeRemaining - commitmentsRemaining;
  const perDay = safeToSpendPerMonth / DAYS_PER_MONTH;
  // The cycle runs from the day of the month the year opened on, so saying
  // which day it started is the difference between this figure reading as the
  // calendar month and reading as what it is.
  const cycleOpened = format(
    setDate(parse(thisCycle.key, 'yyyy-MM', new Date()), detail.year.startDate.getDate()),
    'd MMM',
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            What is left for the rest of the year
            <LeftBreakdown detail={detail} />
          </CardTitle>
          <CardDescription>
            {months.toFixed(1)} months left to spend in, {incomeCyclesRemaining} more salaries.
            Everything already promised comes off first.
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
          <Row
            label="Income still to come"
            note={`${incomeCyclesRemaining} salaries`}
            value={incomeRemaining}
          />
          <Row
            label="Total available"
            rule
            strong
            value={balanceToday - pendingSpend + incomeRemaining}
          />

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
          <CardTitle>How much can I spend?</CardTitle>
          <CardDescription>
            The same {months.toFixed(1)} months read three ways. The last row is the one to follow
            if {formatCurrency(goal)} invested is the point.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">To reach your goal, spend at most</p>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <p className="text-3xl font-semibold">
                {formatCurrency(safeToSpendPerMonth)}
                <span className="text-muted-foreground ml-1 text-sm font-normal">/month</span>
              </p>
              <p className="text-muted-foreground text-lg">
                {formatCurrency(perDay)}
                <span className="ml-1 text-sm">/day</span>
              </p>
            </div>
            {/* The same number the phone widget shows, read from the same
                field, so the two can never be seen to disagree. */}
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
            <p className="text-muted-foreground/70 text-xs">
              {formatCurrency(thisCycle.spent)} spent since {cycleOpened}
            </p>
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
                perMonth={safeToSpendPerMonth}
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
