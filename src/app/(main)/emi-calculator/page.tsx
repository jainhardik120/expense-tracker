'use client';

import { useState } from 'react';

import { useQueryStates } from 'nuqs';

import { type EMICalculationResult, emiCalculatorParser } from '@/types';

import { calculateSchedule } from './_components/calculations';
import { LoanDetailsForm } from './_components/loan-details-form';
import { PaymentScheduleTable } from './_components/payment-schedule-table';
import { SummaryCard } from './_components/summary-card';

export default function EMICalculatorPage() {
  const [defaultValues, setDefaultValues] = useQueryStates(emiCalculatorParser);
  const [result, setResult] = useState<EMICalculationResult>(calculateSchedule(defaultValues));

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
        <SummaryCard result={result} />
      </div>
      <PaymentScheduleTable result={result} />
    </div>
  );
}
