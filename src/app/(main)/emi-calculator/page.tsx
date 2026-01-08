'use client';

import { useMemo, useState } from 'react';

import { calculateSchedule } from './_components/calculations';
import { LoanDetailsForm } from './_components/loan-details-form';
import { PaymentScheduleTable } from './_components/payment-schedule-table';
import { SummaryCard } from './_components/summary-card';
import { type FormValues } from './_components/types';

export default function EMICalculatorPage() {
  const [formValues, setFormValues] = useState<FormValues>({
    calculationMode: 'emi' as const,
    principalAmount: 0,
    emiAmount: 0,
    totalEmiAmount: 0,
    annualRate: 16,
    tenureMonths: 6,
    gstRate: 18,
    processingFees: 199,
    processingFeesGst: 18,
  });

  const result = useMemo(() => {
    return calculateSchedule(formValues);
  }, [formValues]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LoanDetailsForm onFormChange={setFormValues} />
        <SummaryCard result={result} />
      </div>
      <PaymentScheduleTable result={result} />
    </div>
  );
}
