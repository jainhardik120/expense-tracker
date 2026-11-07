'use client';

import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEpfoAnnualRate, getEpfoCreditDate } from '@/lib/epfo';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import { formatFinancialYearLabel, getFinancialYearStart } from '@/lib/salary';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { amount } from '@/types';

type EpfoSummary = RouterOutput['investments']['getEpfoSummary'];
type PendingCredit = EpfoSummary['pending'][number];

const MAX_AMOUNT = 9999999999;
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;

const formatMonth = (date: Date) => formatInTimeZone(date, 'UTC', DATE_FORMAT.month);

const creditSchema = z.object({ creditedOn: z.date(), amount });

const creditFields: FormField<z.input<typeof creditSchema>>[] = [
  { name: 'creditedOn', label: 'Credited on', type: 'datetime' },
  { name: 'amount', label: 'Credited amount (INR)', type: 'number', min: 0, max: MAX_AMOUNT },
];

const MarkCreditedButton = ({
  credit,
  refresh,
}: {
  credit: PendingCredit;
  refresh: () => Promise<void> | void;
}) => {
  const mutation = api.investments.markEpfoCredited.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          Mark credited
        </Button>
      }
      defaultValues={{
        creditedOn: getEpfoCreditDate(credit.dueMonth),
        amount: String(credit.expectedAmount),
      }}
      fields={creditFields}
      mapInput={(values) => ({ salaryPaymentId: credit.salaryPaymentId, ...values })}
      modalDescription={`${formatMonth(credit.periodStart)} salary, due ${formatMonth(credit.dueMonth)}`}
      mutation={mutation}
      refresh={refresh}
      schema={creditSchema}
      successToast={() => 'EPFO credit recorded'}
      titleText="Mark EPFO credited"
    />
  );
};

const interestSchema = z.object({
  financialYearStart: z.coerce.number().int().min(YEAR_MIN).max(YEAR_MAX),
  amount,
});

const interestFields: FormField<z.input<typeof interestSchema>>[] = [
  {
    name: 'financialYearStart',
    label: 'Financial year starting',
    type: 'number',
    min: YEAR_MIN,
    max: YEAR_MAX,
  },
  { name: 'amount', label: 'Interest credited (INR)', type: 'number', min: 0, max: MAX_AMOUNT },
];

const RecordInterestButton = ({ refresh }: { refresh: () => Promise<void> | void }) => {
  const mutation = api.investments.saveEpfoInterest.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          Record interest
        </Button>
      }
      defaultValues={{
        financialYearStart: getFinancialYearStart(new Date()) - 1,
        amount: '',
      }}
      fields={interestFields}
      mutation={mutation}
      refresh={refresh}
      schema={interestSchema}
      successToast={() => 'EPFO interest recorded'}
      titleText="Record EPFO interest"
    />
  );
};

export const EpfoCard = ({ refresh }: { refresh: () => Promise<void> | void }) => {
  const { data } = api.investments.getEpfoSummary.useQuery();
  if (data === undefined) {
    return null;
  }
  const { pending, pendingAmount, pendingInterest, interestYears } = data;
  const monthsLabel = pending.length === 1 ? '1 month' : `${pending.length} months`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>EPFO credits and interest</CardTitle>
        <CardDescription>
          {pending.length === 0
            ? 'Every salary month with PF has a credit.'
            : `${monthsLabel} pending: ${formatCurrency(pendingAmount)}, plus ${formatCurrency(pendingInterest)} estimated interest as of today.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Credit pending</h3>
          <ul className="divide-y">
            {pending.map((credit) => (
              <li
                key={credit.salaryPaymentId}
                className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm">{formatMonth(credit.periodStart)} salary</p>
                    <p className="text-muted-foreground text-xs">
                      Due {formatMonth(credit.dueMonth)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums">{formatCurrency(credit.expectedAmount)}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      +{formatCurrency(credit.estimatedInterest)} est.
                    </p>
                  </div>
                </div>
                <div className="self-end sm:self-auto">
                  <MarkCreditedButton credit={credit} refresh={refresh} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Interest</h3>
            <RecordInterestButton refresh={refresh} />
          </div>
          <ul className="divide-y">
            {interestYears.map((year) => (
              <li
                key={year.financialYearStart}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div>
                  <p className="text-sm">{formatFinancialYearLabel(year.financialYearStart)}</p>
                  <p className="text-muted-foreground text-xs">
                    {getEpfoAnnualRate(year.financialYearStart)}% a year
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">{formatCurrency(year.amount)}</span>
                  <Badge variant={year.isCredited ? 'default' : 'secondary'}>
                    {year.isCredited ? 'Credited' : 'Estimated'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
