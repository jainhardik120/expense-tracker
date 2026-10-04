'use client';

import { HelpTopic } from '@/components/help/help-topic';
import { HelpBar, HelpCalc, HelpCard, HelpCompare, HelpNote } from '@/components/help/help-visuals';

export const BudgetIncomeHelp = () => (
  <HelpTopic label="How income lines work" title="Income">
    <HelpCard
      lede="Matched by rules, exactly like expense lines. First match wins."
      title="What an income line is"
    >
      <HelpBar
        segments={[
          { label: 'Salary', value: 100000, tone: 'spent' },
          { label: 'Bonus', value: 20000, tone: 'committed' },
          { label: 'Cashback', value: 2000, tone: 'free' },
        ]}
      />
      <HelpNote>
        Each one is then pointed somewhere. That choice is the whole of what this table does.
      </HelpNote>
    </HelpCard>

    <HelpCard
      lede="Three places money can go. The next three cards take each one."
      title="Where income goes"
    >
      <div className="flex flex-col gap-1.5 text-xs">
        {[
          ['Down the waterfall', 'funds every line, top to bottom'],
          ['Onto one line', "raises only that line's budget"],
          ['Excluded', 'kept out of the budget entirely'],
        ].map(([destination, effect]) => (
          <div key={destination} className="flex items-baseline gap-2">
            <span className="font-medium">{destination}</span>
            <span className="text-muted-foreground ml-auto">{effect}</span>
          </div>
        ))}
      </div>
    </HelpCard>

    <HelpCard
      lede="The default. Pays for the lines in order; the bottom one keeps the rest."
      title="Down the waterfall"
    >
      <HelpBar
        segments={[
          { label: 'Claimed by the lines above', value: 110000, tone: 'spent' },
          { label: 'Left for the residual line', value: 10000, tone: 'free' },
        ]}
      />
      <HelpCalc
        result={{ label: 'Left to invest', value: 10000 }}
        rows={[
          { label: 'Income down the waterfall', value: 120000 },
          { label: 'Every line above', value: -110000 },
        ]}
      />
    </HelpCard>

    <HelpCard lede="A bonus put against the trip it paid for." title="Pointed at one line">
      <HelpCompare
        items={[
          {
            title: 'Down the waterfall',
            children: (
              <HelpCalc
                result={{ label: 'Trip variance', value: 20000, note: 'over' }}
                rows={[
                  { label: 'Trip budget', value: 0 },
                  { label: 'Spent on the trip', value: -20000 },
                ]}
                tone="bad"
              />
            ),
          },
          {
            title: 'Pointed at Trip',
            children: (
              <HelpCalc
                result={{ label: 'Trip variance', value: 0, note: 'funded' }}
                rows={[
                  { label: 'Trip budget', value: 20000, note: 'from the bonus' },
                  { label: 'Spent on the trip', value: -20000 },
                ]}
              />
            ),
          },
        ]}
      />
      <HelpNote>The money is the same either way. Pointing it says what it was for.</HelpNote>
    </HelpCard>

    <HelpCard lede="Money that arrived but is not yours to plan with." title="Excluded">
      <HelpCalc
        result={{ label: 'Counted as income', value: 100000 }}
        rows={[
          { label: 'Paid into the account', value: 130000 },
          { label: 'Excluded', value: -30000, note: 'a friend settling up' },
        ]}
      />
      <HelpNote>It never enters the budget, so it cannot inflate what there is to invest.</HelpNote>
    </HelpCard>

    <HelpCard lede="Last year's leftover, treated as income on day one." title="Opening balance">
      <HelpCalc
        result={{ label: 'Income the year has to work with', value: 140000 }}
        rows={[
          { label: 'Carried in from last year', value: 20000 },
          { label: 'Earned this year', value: 120000, note: '+' },
        ]}
      />
      <HelpNote>
        Point it at a line to spend it on something specific, or leave it in the waterfall and it
        ends up invested.
      </HelpNote>
    </HelpCard>
  </HelpTopic>
);
