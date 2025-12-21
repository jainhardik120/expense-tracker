'use client';

import { useRouter } from 'next/navigation';

import { SquarePen } from 'lucide-react';
import { type z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { createInvestmentSchema, type Investment } from '@/types';

const investmentFormFields: FormField<z.infer<typeof createInvestmentSchema>>[] = [
  {
    name: 'investmentKind',
    label: 'Investment Kind',
    type: 'input',
    placeholder: 'e.g., Stocks, Mutual Funds, FD, etc.',
  },
  {
    name: 'investmentDate',
    label: 'Investment Date',
    type: 'datetime',
  },
  {
    name: 'investmentAmount',
    label: 'Investment Amount',
    type: 'number',
    placeholder: 'Investment Amount',
    min: 0,
    max: 9999999999,
  },
  {
    name: 'maturityDate',
    label: 'Maturity Date (Optional)',
    type: 'datetime',
  },
  {
    name: 'maturityAmount',
    label: 'Maturity Amount (Optional)',
    type: 'number',
    placeholder: 'Maturity Amount',
    min: 0,
    max: 9999999999,
  },
  {
    name: 'amount',
    label: 'Amount (Optional)',
    type: 'number',
    placeholder: 'Amount',
    min: 0,
    max: 9999999999,
  },
  {
    name: 'units',
    label: 'Units (Optional)',
    type: 'number',
    placeholder: 'Number of Units',
    min: 0,
    max: 9999999999,
  },
  {
    name: 'purchaseRate',
    label: 'Purchase Rate (Optional)',
    type: 'number',
    placeholder: 'Purchase Rate',
    min: 0,
    max: 9999999999,
  },
];

export const CreateInvestmentForm = () => {
  const mutation = api.investments.addInvestment.useMutation();
  const router = useRouter();

  return (
    <MutationModal
      button={
        <Button className="h-8" variant="outline">
          New Investment
        </Button>
      }
      defaultValues={{
        investmentKind: '',
        investmentDate: new Date(),
        investmentAmount: '',
        maturityDate: new Date(),
        maturityAmount: undefined,
        amount: undefined,
        units: undefined,
        purchaseRate: undefined,
      }}
      fields={investmentFormFields}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={createInvestmentSchema}
      successToast={(result) => `${result.length} investment(s) created`}
      titleText="Add Investment"
    />
  );
};

export const UpdateInvestmentForm = ({
  refresh,
  investmentId,
  initialData,
}: {
  refresh?: () => void;
  investmentId: string;
  initialData: Investment;
}) => {
  const mutation = api.investments.updateInvestment.useMutation();

  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" variant="ghost">
          <SquarePen />
        </Button>
      }
      defaultValues={{
        investmentKind: initialData.investmentKind,
        investmentDate: initialData.investmentDate,
        investmentAmount: initialData.investmentAmount,
        maturityDate: initialData.maturityDate ?? undefined,
        maturityAmount: initialData.maturityAmount ?? undefined,
        amount: initialData.amount ?? undefined,
        units: initialData.units ?? undefined,
        purchaseRate: initialData.purchaseRate ?? undefined,
      }}
      fields={investmentFormFields}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: investmentId,
            createInvestmentSchema: values,
          });
        },
      }}
      refresh={refresh}
      schema={createInvestmentSchema}
      successToast={(result) => `${result.length} investment(s) updated`}
      titleText="Update Investment"
    />
  );
};
