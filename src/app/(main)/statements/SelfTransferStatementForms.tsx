'use client';

import { useMemo } from 'react';

import { type z } from 'zod';

import { type FormField } from '@/components/dynamic-form-fields';
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

export const CreateSelfTransferStatementForm = ({ refresh }: { refresh?: () => void }) => {
  const { data: accountsData = [] } = api.accounts.getAccounts.useQuery();
  const mutation = api.statements.addSelfTransferStatement.useMutation();
  const formFields = useMemo(() => statementFormFields(accountsData), [accountsData]);
  return (
    <MutationModal
      button={<Button variant="outline">Self Transfer</Button>}
      defaultValues={{
        toAccountId: '',
        fromAccountId: '',
        amount: '',
        createdAt: new Date(),
      }}
      fields={formFields}
      mutation={mutation}
      refresh={refresh}
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
}: {
  refresh?: () => void;
  statementId: string;
  initialData: SelfTransferStatement;
}) => {
  const { data: accountsData = [] } = api.accounts.getAccounts.useQuery();
  const mutation = api.statements.updateSelfTransferStatement.useMutation();
  const formFields = useMemo(() => statementFormFields(accountsData), [accountsData]);
  return (
    <MutationModal
      button={<Button variant="outline">Update Statement</Button>}
      defaultValues={initialData}
      fields={formFields}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: statementId,
            createSelfTransferSchema: values,
          });
        },
      }}
      refresh={refresh}
      schema={createSelfTransferSchema}
      successToast={(result) => `${result.length} statement(s) updated`}
      titleText="Update Statement"
    />
  );
};
