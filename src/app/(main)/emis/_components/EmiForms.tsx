'use client';

import { useRouter } from 'next/navigation';

import { SquarePen } from 'lucide-react';
import { type z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { createEmiSchema, type Emi } from '@/types';

type CreditCard = RouterOutput['accounts']['getCreditCards'][number];

const createEmiFormFields = (
  creditCards: CreditCard[],
): FormField<z.infer<typeof createEmiSchema>>[] => [
  {
    name: 'name',
    label: 'EMI Name',
    type: 'input',
    placeholder: 'e.g., Laptop EMI, Phone EMI',
  },
  {
    name: 'creditId',
    label: 'Credit Card',
    type: 'select',
    options: creditCards.map((card) => ({
      label: card.accountName,
      value: card.id,
    })),
  },
  {
    name: 'principal',
    label: 'Principal Amount',
    type: 'number',
    placeholder: 'Principal Amount',
    min: 0,
    max: 9999999999,
  },
  {
    name: 'tenure',
    label: 'Tenure (Months)',
    type: 'number',
    placeholder: 'Number of months',
    min: 1,
    max: 360,
  },
  {
    name: 'annualInterestRate',
    label: 'Annual Interest Rate (%)',
    type: 'number',
    placeholder: 'Interest rate',
    min: 0,
    max: 100,
  },
  {
    name: 'processingFees',
    label: 'Processing Fees',
    type: 'number',
    placeholder: 'Processing fees amount',
    min: 0,
    max: 9999999999,
  },
  {
    name: 'processingFeesGst',
    label: 'GST on Processing Fees (%)',
    type: 'number',
    placeholder: 'GST percentage',
    min: 0,
    max: 100,
  },
  {
    name: 'gst',
    label: 'GST on Interest (%)',
    type: 'number',
    placeholder: 'GST percentage',
    min: 0,
    max: 100,
  },
  {
    name: 'balance',
    label: 'Current Balance',
    type: 'number',
    placeholder: 'Outstanding balance',
    min: 0,
    max: 9999999999,
  },
];

export const CreateEmiForm = ({ creditCards }: { creditCards: CreditCard[] }) => {
  const mutation = api.emis.addEmi.useMutation();
  const router = useRouter();

  return (
    <MutationModal
      button={
        <Button className="h-8" variant="outline">
          New EMI
        </Button>
      }
      defaultValues={{
        name: '',
        creditId: creditCards[0]?.id ?? '',
        principal: '',
        tenure: '',
        annualInterestRate: '',
        processingFees: '',
        processingFeesGst: '',
        gst: '',
        balance: '',
      }}
      fields={createEmiFormFields(creditCards)}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={createEmiSchema}
      successToast={(result) => `${result.length} EMI(s) created`}
      titleText="Add EMI"
    />
  );
};

export const UpdateEmiForm = ({
  refresh,
  emiId,
  initialData,
  creditCards,
}: {
  refresh?: () => void;
  emiId: string;
  initialData: Emi;
  creditCards: CreditCard[];
}) => {
  const mutation = api.emis.updateEmi.useMutation();

  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" variant="ghost">
          <SquarePen />
        </Button>
      }
      defaultValues={{
        name: initialData.name,
        creditId: initialData.creditId,
        principal: initialData.principal,
        tenure: initialData.tenure,
        annualInterestRate: initialData.annualInterestRate,
        processingFees: initialData.processingFees,
        processingFeesGst: initialData.processingFeesGst,
        gst: initialData.gst,
        balance: initialData.balance,
      }}
      fields={createEmiFormFields(creditCards)}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: emiId,
            createEmiSchema: values,
          });
        },
      }}
      refresh={refresh}
      schema={createEmiSchema}
      successToast={(result) => `${result.length} EMI(s) updated`}
      titleText="Update EMI"
    />
  );
};
