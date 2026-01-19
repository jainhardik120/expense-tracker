'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { SquarePen } from 'lucide-react';
import { type z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { createRecurringPaymentSchema, type RecurringPayment } from '@/types';

const recurringPaymentFormFields: FormField<z.infer<typeof createRecurringPaymentSchema>>[] = [
  {
    name: 'name',
    label: 'Payment Name',
    type: 'input',
    placeholder: 'e.g., Netflix Subscription, Rent',
  },
  {
    name: 'category',
    label: 'Category',
    type: 'input',
    placeholder: 'e.g., Utilities, Entertainment',
  },
  {
    name: 'amount',
    label: 'Amount',
    type: 'number',
    placeholder: '0',
  },
  {
    name: 'frequency',
    label: 'Frequency',
    type: 'select',
    options: [
      { label: 'Daily', value: 'daily' },
      { label: 'Weekly', value: 'weekly' },
      { label: 'Monthly', value: 'monthly' },
      { label: 'Quarterly', value: 'quarterly' },
      { label: 'Yearly', value: 'yearly' },
    ],
  },
  {
    name: 'frequencyMultiplier',
    label: 'Every (multiplier)',
    type: 'number',
    placeholder: '1',
  },
  {
    name: 'startDate',
    label: 'Start Date',
    type: 'date',
  },
  {
    name: 'endDate',
    label: 'End Date (Optional)',
    type: 'date',
  },
];

export const CreateRecurringPaymentForm = () => {
  const mutation = api.recurringPayments.addRecurringPayment.useMutation();
  const router = useRouter();
  const currentDate = useMemo(() => new Date(), []);

  return (
    <MutationModal
      button={
        <Button className="h-8" variant="outline">
          New Recurring Payment
        </Button>
      }
      defaultValues={{
        name: '',
        category: '',
        amount: '',
        frequency: 'monthly' as const,
        frequencyMultiplier: '1',
        startDate: currentDate,
        endDate: null,
      }}
      fields={recurringPaymentFormFields}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={createRecurringPaymentSchema}
      successToast={(result) => `${result.length} recurring payment(s) created`}
      titleText="Add Recurring Payment"
    />
  );
};

export const UpdateRecurringPaymentForm = ({
  refresh,
  recurringPaymentId,
  initialData,
}: {
  refresh?: () => void;
  recurringPaymentId: string;
  initialData: RecurringPayment;
}) => {
  const mutation = api.recurringPayments.updateRecurringPayment.useMutation();

  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" variant="ghost">
          <SquarePen />
        </Button>
      }
      defaultValues={initialData}
      fields={recurringPaymentFormFields}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: recurringPaymentId,
            ...values,
          });
        },
      }}
      refresh={refresh}
      schema={createRecurringPaymentSchema}
      successToast={(result) => `${result.length} recurring payment(s) updated`}
      titleText="Update Recurring Payment"
    />
  );
};
