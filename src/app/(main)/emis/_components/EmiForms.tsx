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
import { emiCalculationFormFields } from '@/types/emi';

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
  ...(emiCalculationFormFields as unknown as FormField<z.infer<typeof createEmiSchema>>[]),
];

export const CreateEmiForm = ({ creditCards }: { creditCards: CreditCard[] }) => {
  const mutation = api.emis.addEmi.useMutation();
  const router = useRouter();

  if (creditCards.length === 0) {
    return (
      <Button className="h-8" disabled variant="outline">
        New EMI (No Credit Cards)
      </Button>
    );
  }

  return (
    <MutationModal
      button={
        <Button className="h-8" variant="outline">
          New EMI
        </Button>
      }
      defaultValues={{
        name: '',
        creditId: creditCards[0].id,
        calculationMode: 'principal' as const,
        principalAmount: '',
        emiAmount: '',
        totalEmiAmount: '',
        tenure: '',
        annualInterestRate: '',
        processingFees: '',
        processingFeesGst: '',
        gst: '',
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
        calculationMode: 'principal' as const,
        principalAmount: initialData.principal,
        emiAmount: '',
        totalEmiAmount: '',
        tenure: initialData.tenure,
        annualInterestRate: initialData.annualInterestRate,
        processingFees: initialData.processingFees,
        processingFeesGst: initialData.processingFeesGst,
        gst: initialData.gst,
      }}
      fields={createEmiFormFields(creditCards)}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: emiId,
            ...values,
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
