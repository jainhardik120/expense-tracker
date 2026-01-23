import type { FormField } from '@/components/dynamic-form/dynamic-form-fields';

import type { emiCalculatorFormSchema } from '.';
import type { z } from 'zod';

export const emiCalculationFormFields: FormField<z.infer<typeof emiCalculatorFormSchema>>[] = [
  {
    name: 'calculationMode',
    label: 'Calculation Mode',
    type: 'select',
    options: [
      { label: 'Principal', value: 'principal' },
      { label: 'Monthly EMI', value: 'emi' },
      { label: 'Total EMI', value: 'totalEmi' },
    ],
  },
  {
    name: 'principal',
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
    name: 'annualInterestRate',
    label: 'Annual Interest Rate (%)',
    type: 'number',
    placeholder: '0',
  },
  {
    name: 'tenure',
    label: 'Tenure (Months)',
    type: 'number',
    placeholder: '0',
  },
  {
    name: 'gst',
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
];
