'use client';

import { HelpTopic } from '@/components/help/help-topic';
import {
  HelpBar,
  HelpCalc,
  HelpCard,
  HelpCompare,
  HelpFigure,
  HelpMatchList,
  HelpNote,
} from '@/components/help/help-visuals';

const YEAR_BUDGET = 'Year budget';

export const BudgetLinesHelp = () => (
  <HelpTopic label="How budget lines work" title="Budget lines">
    <HelpCard lede="Every expense falls into the first line that claims it." title="What a line is">
      <HelpMatchList
        rows={[
          { label: 'Rent · category House', matches: false },
          { label: 'Gifts · tag Gift', matches: true },
          { label: 'Shopping · category Shopping', matches: true },
          { label: 'Living · everything else', matches: true },
        ]}
        subject="₹8,748.00 · Shopping · tagged Gift"
      />
    </HelpCard>

    <HelpCard
      lede="Drag a line up and it gets first refusal. Nothing is ever counted twice."
      title="Order is the whole trick"
    >
      <HelpCompare
        items={[
          {
            title: 'Gifts above Shopping',
            children: (
              <HelpBar
                segments={[
                  { label: 'Gifts', value: 8748, tone: 'spent' },
                  { label: 'Shopping', value: 0, tone: 'committed' },
                ]}
              />
            ),
          },
          {
            title: 'Shopping above Gifts',
            children: (
              <HelpBar
                segments={[
                  { label: 'Gifts', value: 0, tone: 'spent' },
                  { label: 'Shopping', value: 8748, tone: 'committed' },
                ]}
              />
            ),
          },
        ]}
      />
    </HelpCard>

    <HelpCard
      lede="Five ways to answer it. The next five cards work each one on ₹10,000."
      title="Where a line's yearly budget comes from"
    >
      <div className="flex flex-col gap-1.5 text-xs">
        {[
          ['Fixed per month', 'amount × months'],
          ['Fixed per year', 'the amount, once'],
          ['Earmarked', 'whatever income points at it'],
          ['Loan schedule', 'the instalments due this year'],
          ['Residual', 'everything the lines above did not claim'],
        ].map(([kind, rule]) => (
          <div key={kind} className="flex items-baseline gap-2">
            <span className="font-medium">{kind}</span>
            <span className="text-muted-foreground ml-auto">{rule}</span>
          </div>
        ))}
      </div>
    </HelpCard>

    <HelpCard lede="₹10,000.00 a month, every month of the year." title="Fixed per month">
      <HelpCalc
        result={{ label: YEAR_BUDGET, value: 120000 }}
        rows={[
          { label: 'Allocation', value: 10000, note: '/mo' },
          { label: 'Months in the year', value: '12', note: '×' },
        ]}
      />
      <HelpNote>
        Rent and money sent home. Spending under it is money saved, not money still to go out.
      </HelpNote>
    </HelpCard>

    <HelpCard lede="₹10,000.00 for the whole year, spent whenever." title="Fixed per year">
      <HelpCalc
        result={{ label: YEAR_BUDGET, value: 10000 }}
        rows={[{ label: 'Allocation', value: 10000, note: '/yr' }]}
      />
      <HelpNote>
        An envelope — flights, shopping. It is assumed you will use all of it, because the flight
        home is still going to be booked. Mark the line done when it is finished.
      </HelpNote>
    </HelpCard>

    <HelpCard lede="No allocation at all. Income decides." title="Funded by earmarked income">
      <HelpCalc
        result={{ label: YEAR_BUDGET, value: 10000 }}
        rows={[
          { label: 'Allocation', value: 0 },
          { label: 'Bonus pointed at this line', value: 10000, note: '+' },
        ]}
      />
      <HelpNote>
        A trip paid for out of a bonus is funded, not overspent. Point income at it on the Income
        table.
      </HelpNote>
    </HelpCard>

    <HelpCard lede="The EMI schedule is the budget." title="Taken from the loan schedule">
      <HelpCalc
        result={{ label: YEAR_BUDGET, value: 10000 }}
        rows={[
          { label: 'Instalments left this year', value: '3', note: '×' },
          { label: 'Each', value: 3333.33 },
        ]}
      />
      <HelpNote>
        A plan starting in March, or running nine months of a twelve month year, has no sensible
        figure to type in. An instalment cannot be overspent, so the schedule is asked instead.
      </HelpNote>
    </HelpCard>

    <HelpCard lede="Not spent — what survives everything else." title="Residual">
      <HelpCalc
        result={{ label: 'Left to invest', value: 10000 }}
        rows={[
          { label: 'Income expected this year', value: 130000 },
          { label: 'Claimed by every line above', value: -120000 },
        ]}
      />
      <HelpNote>
        One line at the bottom. Every rupee another line does not claim lands here, which is why
        overspending anywhere shows up as investing less.
      </HelpNote>
    </HelpCard>

    <HelpCard
      lede="Spent has left the account. Committed is signed for and hasn't."
      title="Spent, committed, remaining"
    >
      <HelpBar
        segments={[
          { label: 'Spent', value: 6000, tone: 'spent' },
          { label: 'Committed', value: 3000, tone: 'committed' },
          { label: 'Remaining', value: 1000, tone: 'free' },
        ]}
      />
      <HelpCalc
        result={{ label: 'Remaining', value: 1000 }}
        rows={[
          { label: YEAR_BUDGET, value: 10000 },
          { label: 'Spent', value: -6000 },
          { label: 'Committed', value: -3000, note: 'EMIs still to pay' },
        ]}
      />
    </HelpCard>

    <HelpCard
      lede="Not today's position — what December looks like if nothing changes."
      title="Over or under"
    >
      <HelpCompare
        items={[
          {
            title: 'Running at ₹12,000.00/mo',
            children: (
              <>
                <HelpFigure label="Will have spent" tone="bad" value="₹1,44,000.00" />
                <HelpCalc
                  result={{ label: 'Over', value: 24000 }}
                  rows={[
                    { label: 'Projected', value: 144000 },
                    { label: YEAR_BUDGET, value: -120000 },
                  ]}
                  tone="bad"
                />
              </>
            ),
          },
          {
            title: 'Running at ₹8,000.00/mo',
            children: (
              <>
                <HelpFigure label="Will have spent" value="₹96,000.00" />
                <HelpCalc
                  result={{ label: 'Under', value: -24000 }}
                  rows={[
                    { label: 'Projected', value: 96000 },
                    { label: YEAR_BUDGET, value: -120000 },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <HelpNote>
        On a ₹10,000.00/mo line. Overspending comes out of what would have been invested;
        underspending goes back to it.
      </HelpNote>
    </HelpCard>

    <HelpCard
      lede="An envelope is assumed to be used up. Only you know when it isn't."
      title="Done for the year"
    >
      <HelpCompare
        items={[
          {
            title: 'Open',
            children: (
              <HelpCalc
                result={{ label: 'Variance', value: 0, note: 'on plan' }}
                rows={[
                  { label: 'Spent', value: 6000 },
                  { label: 'Assumed still to spend', value: 4000, note: '+' },
                ]}
              />
            ),
          },
          {
            title: 'Marked done',
            children: (
              <HelpCalc
                result={{ label: 'Variance', value: -1000, note: 'saved' }}
                rows={[
                  { label: 'Spent', value: 6000 },
                  { label: 'Only what is owed', value: 3000, note: '+' },
                ]}
              />
            ),
          },
        ]}
      />
      <HelpNote>
        Closing a line moves its leftover out of On plan and into Saved by spending less, where it
        counts towards investment.
      </HelpNote>
    </HelpCard>
  </HelpTopic>
);
