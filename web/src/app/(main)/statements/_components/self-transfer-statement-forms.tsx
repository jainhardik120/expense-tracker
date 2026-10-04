'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { type z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type Account, createSelfTransferSchema, type SelfTransferStatement } from '@/types';

const statementFormFields = (
  accountsData: Account[],
): FormField<z.infer<typeof createSelfTransferSchema>>[] => {
  return [
    {
      name: 'fromAccountId',
      label: 'From Account',
      type: 'select',
      placeholder: 'Select Account',
      options: accountsData.map((account) => ({
        label: account.accountName,
        value: account.id,
      })),
    },
    {
      name: 'toAccountId',
      label: 'To Account',
      type: 'select',
      placeholder: 'Select Account',
      options: accountsData.map((account) => ({
        label: account.accountName,
        value: account.id,
      })),
    },
    {
      name: 'amount',
      label: 'Amount',
      type: 'number',
      placeholder: 'Amount',
    },
    {
      name: 'createdAt',
      label: 'Datetime',
      type: 'datetime',
    },
  ];
};

export const CreateSelfTransferStatementForm = ({
  accountsData,
  defaultValues,
  onSuccess,
  trigger,
}: {
  accountsData: Account[];
  trigger?: React.ReactNode;
  defaultValues?: Partial<z.infer<typeof createSelfTransferSchema>>;
  onSuccess?: (id: string) => Promise<void> | void;
}) => {
  const mutation = api.statements.createSelfTransferStatement.useMutation();
  const formFields = useMemo(() => statementFormFields(accountsData), [accountsData]);
  const router = useRouter();
  return (
    <MutationModal
      button={
        trigger !== undefined ? (
          trigger
        ) : (
          <Button className="h-8" variant="outline">
            New Self Transfer
          </Button>
        )
      }
      defaultValues={{
        toAccountId: '',
        fromAccountId: '',
        amount: '',
        createdAt: new Date(),
        ...defaultValues,
      }}
      fields={formFields}
      mutation={mutation}
      refresh={async (result) => {
        await onSuccess?.(result[0].id);
        router.refresh();
      }}
      schema={createSelfTransferSchema}
      successToast={(result) => `${result.length} statement(s) created`}
      titleText="Add Statement"
    />
  );
};

export const UpdateSelfTransferStatementForm = ({
  refresh,
  statementId,
  initialData,
  accountsData,
  trigger,
}: {
  refresh?: () => void;
  statementId: string;
  initialData: SelfTransferStatement;
  accountsData: Account[];
  trigger: React.ReactNode;
}) => {
  const mutation = api.statements.updateSelfTransferStatement.useMutation();
  const formFields = useMemo(() => statementFormFields(accountsData), [accountsData]);
  return (
    <MutationModal
      button={trigger}
      defaultValues={initialData}
      fields={formFields}
      mapInput={(values) => ({ ...values, id: statementId })}
      mutation={mutation}
      refresh={refresh}
      schema={createSelfTransferSchema}
      successToast={(result) => `${result.length} statement(s) updated`}
      titleText="Update Statement"
    />
  );
};
