import { useEffect, useRef } from 'react';

import { type UseFormReturn } from 'react-hook-form';

import DynamicForm from '@/components/dynamic-form/dynamic-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { formSchema, type FormValues } from './types';

interface LoanDetailsFormProps {
  onFormChange: (values: FormValues) => void;
}

export const LoanDetailsForm = ({ onFormChange }: LoanDetailsFormProps) => {
  const formRef = useRef<UseFormReturn<FormValues>>(null);

  useEffect(() => {
    if (formRef.current === null) {
      return;
    }

    const subscription = formRef.current.watch((values) => {
      onFormChange(values as FormValues);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onFormChange]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loan Details</CardTitle>
        <CardDescription>
          Enter your loan parameters to calculate EMI and payment schedule
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DynamicForm
          ref={formRef}
          defaultValues={{
            calculationMode: 'emi' as const,
            principalAmount: 0,
            emiAmount: 0,
            totalEmiAmount: 0,
            annualRate: 16,
            tenureMonths: 6,
            gstRate: 18,
            processingFees: 199,
            processingFeesGst: 18,
          }}
          fields={[
            {
              name: 'calculationMode',
              label: 'Calculation Mode',
              type: 'select',
              options: [
                { label: 'Principal', value: 'principal' },
                { label: 'EMI', value: 'emi' },
                { label: 'Total EMI', value: 'totalEmi' },
              ],
            },
            {
              name: 'principalAmount',
              label: 'Principal Amount',
              type: 'number',
              placeholder: '0',
              displayCondition: (values) => values.calculationMode === 'principal',
            },
            {
              name: 'emiAmount',
              label: 'Monthly EMI Amount',
              type: 'number',
              placeholder: '0',
              displayCondition: (values) => values.calculationMode === 'emi',
            },
            {
              name: 'totalEmiAmount',
              label: 'Total EMI Amount',
              type: 'number',
              placeholder: '0',
              displayCondition: (values) => values.calculationMode === 'totalEmi',
            },
            {
              name: 'annualRate',
              label: 'Annual Interest Rate (%)',
              type: 'number',
              placeholder: '0',
            },
            {
              name: 'tenureMonths',
              label: 'Tenure (Months)',
              type: 'number',
              placeholder: '0',
              min: 1,
              max: 12,
              step: 1,
            },
            {
              name: 'gstRate',
              label: 'GST Rate on Interest (%)',
              type: 'number',
              placeholder: '0',
            },
            {
              name: 'processingFees',
              label: 'Processing Fees',
              type: 'number',
              placeholder: '0',
            },
            {
              name: 'processingFeesGst',
              label: 'GST Rate on Processing Fees (%)',
              type: 'number',
              placeholder: '0',
            },
          ]}
          schema={formSchema}
          showSubmitButton={false}
        />
      </CardContent>
    </Card>
  );
};
