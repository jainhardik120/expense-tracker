'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { type z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { createEmiSchema, type Emi } from '@/types';
import { emiCalculationFormFields } from '@/types/emi';
import type { CreditCard } from '@/types/router-outputs';

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
    name: 'firstInstallmentDate',
    label: 'First Installment Date',
    type: 'date',
  },
  {
    name: 'processingFeesDate',
    label: 'Processing Fees Date',
    type: 'date',
  },
  {
    name: 'iafe',
    label: 'IAFE (Interest Adjustment for First EMI)',
    type: 'number',
    placeholder: '0',
  },
  {
    name: 'tags',
    label: 'Tags',
    type: 'stringArray',
    placeholder: 'Tags the instalments will carry, e.g. Flight',
  },
  ...(emiCalculationFormFields as unknown as FormField<z.infer<typeof createEmiSchema>>[]),
];

export const CreateEmiForm = ({ creditCards }: { creditCards: CreditCard[] }) => {
  const mutation = api.emis.createEmi.useMutation();
  const router = useRouter();
  const currentDate = useMemo(() => new Date(), []);

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
        principal: '',
        emiAmount: '',
        totalEmiAmount: '',
        tenure: '',
        annualInterestRate: '',
        processingFees: '',
        processingFeesGst: '',
        gst: '',
        firstInstallmentDate: currentDate,
        processingFeesDate: currentDate,
        iafe: '',
        tags: [],
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
  trigger,
}: {
  refresh?: () => void;
  emiId: string;
  initialData: Emi;
  creditCards: CreditCard[];
  trigger: React.ReactNode;
}) => {
  const mutation = api.emis.updateEmi.useMutation();

  return (
    <MutationModal
      button={trigger}
      defaultValues={{
        ...initialData,
        calculationMode: 'principal' as const,
        emiAmount: '',
        totalEmiAmount: '',
      }}
      fields={createEmiFormFields(creditCards)}
      mapInput={(values) => ({
        id: emiId,
        ...values,
      })}
      mutation={mutation}
      refresh={refresh}
      schema={createEmiSchema}
      successToast={(result) => `${result.length} EMI(s) updated`}
      titleText="Update EMI"
    />
  );
};
