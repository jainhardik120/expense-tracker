import { useEffect, useRef } from 'react';

import { type UseFormReturn } from 'react-hook-form';

import DynamicForm from '@/components/dynamic-form/dynamic-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { emiCalculatorFormSchema, type EMICalculatorFormValues } from '@/types';
import { emiCalculationFormFields } from '@/types/emi';

interface LoanDetailsFormProps {
  onFormChange: (values: Partial<EMICalculatorFormValues>) => void;
  defaultValues: EMICalculatorFormValues;
}

export const LoanDetailsForm = ({ onFormChange, defaultValues }: LoanDetailsFormProps) => {
  const formRef = useRef<UseFormReturn<EMICalculatorFormValues>>(null);

  useEffect(() => {
    if (formRef.current === null) {
      return;
    }
    const subscription = formRef.current.watch((values) => {
      onFormChange(values);
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
          defaultValues={defaultValues}
          fields={emiCalculationFormFields}
          schema={emiCalculatorFormSchema}
          showSubmitButton={false}
        />
      </CardContent>
    </Card>
  );
};
