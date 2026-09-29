'use client';

import { useState } from 'react';

import { Info } from 'lucide-react';

import { HelpCalc, HelpNote, type CalcRow } from '@/components/help/help-visuals';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';

type Detail = RouterOutput['budget']['getYearDetail'];

/** A heading for one step of the working. */
const Step = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

/**
 * Every figure on the card, with the arithmetic that produced it.
 *
 * The card is four numbers and an answer, and three of the four are themselves
 * sums of things that live on other pages -- what is in the accounts, what the
 * payroll still owes, what each line has left to pay. Saying so here is the
 * difference between a number you trust and one you take on faith.
 */
export const LeftBreakdown = ({ detail }: { detail: Detail }) => {
  const [open, setOpen] = useState(false);
  const {
    projection,
    balanceToday,
    balanceParts,
    pendingSpend,
    pendingCount,
    pendingIncome,
    pendingCounted,
  } = detail;
  const { commitmentsRemaining, discretionaryRemaining, lines, spendMonths } = projection;

  const totalAvailable = balanceToday - pendingSpend + pendingCounted;
  // What the payroll owes but the budget is told to ignore.
  const keptOut = pendingIncome.salary + pendingIncome.bonus - pendingCounted;
  const left = totalAvailable - commitmentsRemaining;

  // The same test the projection uses: everything except day-to-day spending,
  // which is what is left over rather than something already promised.
  const commitments = lines
    .filter(
      (line) =>
        line.allocationKind !== 'residual' &&
        !(line.discretionary && line.allocationKind === 'monthly') &&
        line.forecastRemaining !== 0,
    )
    .sort((a, b) => b.forecastRemaining - a.forecastRemaining);

  const summary: CalcRow[] = [
    { label: 'Balance today', value: balanceToday },
    ...(pendingCount === 0
      ? []
      : [
          {
            label: 'Spent but not entered yet',
            value: -pendingSpend,
            note: `${String(pendingCount)} waiting`,
          },
        ]),
    { label: 'Income still to come', value: pendingCounted },
    { label: 'Everything already promised', value: -commitmentsRemaining },
  ];

  return (
    <Modal
      className="sm:max-w-140"
      open={open}
      setOpen={setOpen}
      title="What is left, and how it is worked out"
      trigger={
        <Button
          aria-label="How this is worked out"
          className="text-muted-foreground hover:text-foreground size-6 rounded-full"
          size="icon"
          type="button"
          variant="ghost"
        >
          <Info className="size-4" />
        </Button>
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
        <Step title="The card, in one sum">
          <HelpCalc result={{ label: 'Left to spend or invest', value: left }} rows={summary} />
        </Step>

        <Step title="Balance today">
          <HelpCalc
            result={{ label: 'Balance today', value: balanceToday }}
            rows={[
              { label: 'Sitting in your accounts', value: balanceParts.inAccounts },
              // The sign says which way the friends ledger points, so the label
              // follows it: a positive balance there is money you owe, a
              // negative one is money still to come back to you.
              balanceParts.owedToFriends > 0
                ? { label: 'Owed to friends', value: -balanceParts.owedToFriends }
                : { label: 'Lent out, still owed to you', value: -balanceParts.owedToFriends },
            ]}
          />
          <HelpNote>
            Money you have lent is still yours, so it counts; money you owe is already spent, so it
            comes off. Both read from the accounts and friends pages, not typed in here.
          </HelpNote>
        </Step>

        <Step title="Income still to come">
          <HelpCalc
            result={{ label: 'Counted as income', value: pendingCounted }}
            rows={[
              {
                label: 'Salary still to be paid',
                value: pendingIncome.salary,
                note: `${String(pendingIncome.payments)} pay dates`,
              },
              { label: 'Bonuses still to be paid', value: pendingIncome.bonus },
              // Only when some of it is pointed out of the budget, so the rows
              // always add up to the figure underneath them.
              ...(keptOut === 0
                ? []
                : [
                    {
                      label: 'Kept outside the budget',
                      value: -keptOut,
                      note: 'your choice, on the Income table',
                    },
                  ]),
            ]}
          />
          <HelpNote>
            Read off your salary schedule, pay date by pay date, so a revision is counted from the
            month it starts -- not averaged out of the payslips that already arrived.
          </HelpNote>
        </Step>

        <Step title="Everything already promised">
          <HelpCalc
            result={{ label: 'Still to pay', value: commitmentsRemaining }}
            rows={commitments.map((line) => ({
              label: line.name,
              value: line.forecastRemaining,
            }))}
          />
          <HelpNote>
            Rent and money home for the months left, the instalments still on each loan, and
            envelopes assumed to be spent. Day-to-day living is not here -- it is what is left over,
            below.
          </HelpNote>
        </Step>

        <Step title="What happens to the rest">
          <HelpCalc
            result={{ label: 'Would be invested', value: left - discretionaryRemaining }}
            rows={[
              { label: 'Left to spend or invest', value: left },
              {
                label: 'Living, at the rate you are going',
                value: -discretionaryRemaining,
                note: `${spendMonths.toFixed(1)} months`,
              },
            ]}
          />
          <HelpNote>
            Spend less than {formatCurrency(discretionaryRemaining)} on living and the difference is
            invested instead. That is the only number on this card you control day to day.
          </HelpNote>
        </Step>
      </div>
    </Modal>
  );
};
