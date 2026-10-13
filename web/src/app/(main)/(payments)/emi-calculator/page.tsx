'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { useQueryStates } from 'nuqs';

import { PaymentScheduleTable } from '@/components/payment-schedule-table';
import { Button } from '@/components/ui/button';
import { calculateSchedule } from '@/server/helpers/emi-calculations';
import { api } from '@/server/react';
import { type EmiCalculationResult, emiCalculatorParser } from '@/types';

import { LoanDetailsForm } from './_components/loan-details-form';
import { SummaryCard } from './_components/summary-card';

import { CreateEmiForm } from '../emis/_components/emi-forms';

export default function EmiCalculatorPage() {
  const [defaultValues, setDefaultValues] = useQueryStates(emiCalculatorParser);
  const [result, setResult] = useState<EmiCalculationResult>(calculateSchedule(defaultValues));
  const { data: creditCards = [] } = api.accounts.getCreditCards.useQuery();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LoanDetailsForm
          defaultValues={defaultValues}
          onFormChange={(values) => {
            void setDefaultValues(values);
            setResult(calculateSchedule(values));
          }}
        />
        <SummaryCard
          action={
            creditCards.length === 0 ? (
              <Button disabled>Create this EMI</Button>
            ) : (
              <CreateEmiForm
                creditCards={creditCards}
                initialValues={defaultValues}
                trigger={<Button>Create this EMI</Button>}
                onCreated={() => {
                  router.push('/emis');
                }}
              />
            )
          }
          result={result}
        />
      </div>
      <PaymentScheduleTable result={result} />
    </div>
  );
}
