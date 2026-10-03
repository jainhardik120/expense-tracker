'use client';

import { useState } from 'react';

import { Info } from 'lucide-react';

import { RowActionTrigger } from '@/components/data-table/row-actions';
import { HelpCalc, HelpNote, type CalcRow } from '@/components/help/help-visuals';
import Modal from '@/components/modal';
import { formatCurrency } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';

type Detail = RouterOutput['budget']['getYearDetail'];
type Projection = Detail['projection'];
type ProjectedLine = Projection['lines'][number];

const Step = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

const YEAR_BUDGET = 'Year budget';

const remainingNote = (line: ProjectedLine): string => {
  if (line.allocationKind === 'residual') {
    return 'For the residual this is what is still to be invested if every other line keeps to its budget.';
  }
  return line.overspent
    ? 'Below zero: the line has spent past its budget, and the difference comes out of the residual.'
    : 'What the line can still spend without eating into the residual.';
};

/** Under half a paisa either way is on budget, not a rounding error dressed as one. */
const HALF_PAISA = 0.005;
const onBudget = (line: ProjectedLine): boolean => Math.abs(line.variance) < HALF_PAISA;

const varianceLabel = (line: ProjectedLine): string => {
  if (onBudget(line)) {
    return 'on budget';
  }
  return line.variance > 0 ? 'over' : 'under';
};

const varianceNote = (line: ProjectedLine): string => {
  if (onBudget(line)) {
    return 'Lands exactly on its budget.';
  }
  if (line.variance > 0) {
    return 'This much comes out of what would otherwise be invested by December.';
  }
  return line.unspentIsSaved
    ? 'Left unspent, this goes to investment.'
    : 'Held for this envelope until it is marked done; only then does it count as saved.';
};

const months = (count: number): string => `${count.toFixed(1)} months`;

/** Only when there is some, so the rows still add up to the figure under them. */
const earmarkedRow = (line: ProjectedLine): CalcRow[] =>
  line.earmarkedIncome === 0
    ? []
    : [{ label: 'Income earmarked for this line', value: line.earmarkedIncome }];

/** How the year budget column was arrived at, which depends on the line's kind. */
const yearBudgetWorking = (
  line: ProjectedLine,
  projection: Projection,
): { rows: CalcRow[]; note: string } => {
  switch (line.allocationKind) {
    case 'monthly':
      return {
        rows: [
          {
            label: `${formatCurrency(line.allocationAmount)} a month`,
            note: `× ${String(projection.totalMonths)} months`,
            value: line.allocationAmount * projection.totalMonths,
          },
          ...earmarkedRow(line),
        ],
        note: 'The monthly figure counts for every month of the year, including the ones gone by.',
      };
    case 'annual':
      return {
        rows: [{ label: 'Set for the year', value: line.allocationAmount }, ...earmarkedRow(line)],
        note: 'A yearly envelope: one figure for the whole year, spent whenever it is spent.',
      };
    case 'earmarked':
      return {
        rows: [{ label: 'Income earmarked for this line', value: line.earmarkedIncome }],
        note: 'Nothing is typed in for this line. Its budget is whatever income the Income table points at it, so with none it has nothing.',
      };
    case 'schedule':
      return {
        rows: [
          {
            label: 'Instalments falling inside the year',
            note: 'from the loan schedule',
            value: line.scheduled.year,
          },
          ...earmarkedRow(line),
        ],
        note: 'The schedule is the budget: an instalment cannot be overspent, only paid.',
      };
    case 'residual':
    default: {
      const claimedByOthers = projection.lines
        .filter((other) => other.allocationKind !== 'residual')
        .reduce((sum, other) => sum + other.yearBudget, 0);
      return {
        rows: [
          { label: 'All income for the year', value: projection.expectedTotalIncome },
          { label: 'Budgeted to every other line', value: -claimedByOthers },
        ],
        note: 'The residual is not budgeted for -- it gets whatever the lines above it do not take. It cannot go below zero.',
      };
    }
  }
};

/**
 * How "still to come" was forecast, which is a different guess per kind.
 *
 * Most kinds take the larger of an expectation and what is already owed, so
 * the owed figure is shown as the floor rather than added in: the rows of a
 * working always add up to the figure under them.
 */
const forecastWorking = (
  line: ProjectedLine,
  projection: Projection,
): { rows: CalcRow[]; note: string } => {
  const owed = line.scheduled.remaining;
  const owedRow: CalcRow = { label: 'Instalments still to fall due', value: owed };
  /** The expectation, unless what is owed is more, in which case that. */
  const atLeastOwed = (expected: CalcRow): CalcRow[] =>
    owed > Number(expected.value)
      ? [{ ...expected, value: formatCurrency(Number(expected.value)), note: 'less than owed' }, owedRow]
      : [expected];
  if (line.closed) {
    return {
      rows: [owedRow],
      note: 'Marked done, so nothing more is expected beyond what is already signed for.',
    };
  }
  if (line.allocationKind === 'annual') {
    return {
      rows: atLeastOwed({
        label: 'What is left of the envelope',
        value: Math.max(line.yearBudget - line.actual, 0),
      }),
      note: 'An open envelope is assumed to be used up, and never less than what is still owed on it. Mark it done to stop assuming that.',
    };
  }
  if (line.allocationKind === 'monthly' && line.discretionary) {
    return {
      rows: atLeastOwed({
        label: `${formatCurrency(line.pacePerMonth)} a month`,
        note: `× ${months(projection.spendMonths)} left`,
        value: line.pacePerMonth * projection.spendMonths,
      }),
      note: `Forecast at the rate it has actually been running at -- ${formatCurrency(line.actual)} over ${months(projection.elapsedMonths)} -- not the allowance: the point is what will happen.`,
    };
  }
  if (line.allocationKind === 'monthly') {
    return {
      rows: atLeastOwed({
        label: `${formatCurrency(line.allocationAmount)} a month`,
        note: `× ${months(projection.remainingMonths)} of pay left`,
        value: line.allocationAmount * projection.remainingMonths,
      }),
      note: 'A fixed commitment goes out with each salary, so it is counted per pay cycle left rather than per calendar month.',
    };
  }
  return {
    rows: [owedRow],
    note: 'Only what the loan and recurring schedules say is still to be paid.',
  };
};

/**
 * Every figure on one budget line, with the arithmetic that produced it.
 *
 * The table gives a line's budget, what it has spent and what is left, but each
 * of those is worked out differently depending on the kind of line it is. This
 * says which way, with the line's own numbers in it.
 */
export const LineBreakdown = ({
  line,
  projection,
  matchedCount,
  claims,
}: {
  line: ProjectedLine;
  projection: Projection;
  matchedCount: number;
  claims: string;
}) => {
  const [open, setOpen] = useState(false);
  const isResidual = line.allocationKind === 'residual';
  const budget = yearBudgetWorking(line, projection);
  const forecast = forecastWorking(line, projection);

  return (
    <Modal
      className="sm:max-w-140"
      open={open}
      setOpen={setOpen}
      title={`${line.name}: how the numbers are worked out`}
      trigger={<RowActionTrigger icon={Info} label="Details" />}
    >
      <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
        <Step title="Actual">
          <HelpCalc
            result={{ label: 'Actual', value: line.actual }}
            rows={[
              { label: 'Claims', value: claims },
              { label: 'Statements claimed this year', value: String(matchedCount) },
            ]}
          />
          <HelpNote>
            Every statement in the year that matches this line’s rule and was not already claimed
            by a line above it -- a statement goes to the first line that wants it.
          </HelpNote>
        </Step>

        <Step title="Year budget">
          <HelpCalc result={{ label: YEAR_BUDGET, value: line.yearBudget }} rows={budget.rows} />
          <HelpNote>{budget.note}</HelpNote>
        </Step>

        <Step title="Committed">
          <HelpCalc
            result={{ label: 'Committed', value: line.committed }}
            // Most lines have no loan or recurring payment behind them, and two
            // rows of noughts would read as though something were missing.
            rows={
              line.scheduled.year === 0
                ? []
                : [
                    { label: 'On the schedule for the whole year', value: line.scheduled.year },
                    { label: 'Already paid', value: -line.scheduled.toDate },
                  ]
            }
          />
          <HelpNote>
            Loan instalments and recurring payments behind this line that fall due before the year
            ends but have not been paid yet. Spoken for, so they come off what is left.
          </HelpNote>
        </Step>

        <Step title="Remaining">
          <HelpCalc
            result={{ label: 'Remaining', value: line.remaining }}
            rows={[
              { label: YEAR_BUDGET, value: line.yearBudget },
              { label: 'Actual', value: -line.actual },
              { label: 'Committed', value: -line.committed },
            ]}
            tone={line.overspent ? 'bad' : 'neutral'}
          />
          <HelpNote>
            {projection.remainingMonths > 0 && line.remaining > 0
              ? `${formatCurrency(line.perMonthRemaining)} a month over the ${months(projection.remainingMonths)} left. `
              : ''}
            {remainingNote(line)}
          </HelpNote>
        </Step>

        {isResidual ? null : (
          <Step title="Where it ends the year">
            <HelpCalc
              result={{ label: 'Still to come', value: line.forecastRemaining }}
              rows={forecast.rows}
            />
            <HelpNote>{forecast.note}</HelpNote>
            <HelpCalc
              result={{
                label: 'Against the budget',
                note: varianceLabel(line),
                value: line.variance,
              }}
              rows={[
                {
                  label: 'Year total',
                  note: `${formatCurrency(line.actual)} spent + ${formatCurrency(line.forecastRemaining)} to come`,
                  value: line.projectedSpend,
                },
                { label: YEAR_BUDGET, value: -line.yearBudget },
              ]}
              tone={line.variance > 0 ? 'bad' : 'neutral'}
            />
            <HelpNote>
              {varianceNote(line)}
            </HelpNote>
          </Step>
        )}
      </div>
    </Modal>
  );
};
