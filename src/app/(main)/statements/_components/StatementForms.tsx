'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { SquarePen } from 'lucide-react';
import { type z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import {
  type Account,
  createStatementSchema,
  type Friend,
  type Statement,
  statementKindMap,
} from '@/types';

const statementFormFields = (
  accountsData: Account[],
  friendsData: Friend[],
): FormField<z.infer<typeof createStatementSchema>>[] => {
  return [
    {
      name: 'statementKind',
      label: 'Statement Kind',
      type: 'select',
      placeholder: 'Select Statement Kind',
      options: Object.entries(statementKindMap).map(([value, label]) => ({
        label,
        value,
      })),
    },
    {
      name: 'accountId',
      label: 'Account ID',
      type: 'select',
      placeholder: 'Select Account',
      options: accountsData.map((account) => ({
        label: account.accountName,
        value: account.id,
      })),
    },
    {
      name: 'friendId',
      label: 'Friend ID',
      type: 'select',
      placeholder: 'Select Friend',
      options: friendsData.map((account) => ({
        label: account.name,
        value: account.id,
      })),
    },
    {
      name: 'category',
      label: 'Category',
      type: 'input',
      placeholder: 'Category',
    },
    {
      name: 'amount',
      label: 'Amount',
      type: 'number',
      placeholder: 'Amount',
      min: -9999999999,
      max: 9999999999,
    },
    {
      name: 'tags',
      label: 'Tags',
      type: 'stringArray',
      placeholder: 'Tags',
    },
    {
      name: 'createdAt',
      label: 'Datetime',
      type: 'datetime',
    },
  ];
};

export const CreateStatementForm = ({
  accountsData,
  friendsData,
}: {
  accountsData: Account[];
  friendsData: Friend[];
}) => {
  const mutation = api.statements.addStatement.useMutation();
  const formFields = useMemo(
    () => statementFormFields(accountsData, friendsData),
    [accountsData, friendsData],
  );
  const router = useRouter();
  return (
    <MutationModal
      button={
        <Button className="h-8" variant="outline">
          New Statement
        </Button>
      }
      defaultValues={{
        amount: '',
        category: '',
        statementKind: 'expense',
        accountId: '',
        friendId: '',
        tags: [],
        createdAt: new Date(),
      }}
      fields={formFields}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={createStatementSchema}
      successToast={(result) => `${result.length} statement(s) created`}
      titleText="Add Statement"
    />
  );
};

export const UpdateStatementForm = ({
  refresh,
  statementId,
  initialData,
  accountsData,
  friendsData,
}: {
  refresh?: () => void;
  statementId: string;
  initialData: Statement;
  accountsData: Account[];
  friendsData: Friend[];
}) => {
  const mutation = api.statements.updateStatement.useMutation();
  const formFields = useMemo(
    () => statementFormFields(accountsData, friendsData),
    [accountsData, friendsData],
  );
  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" variant="ghost">
          <SquarePen />
        </Button>
      }
      defaultValues={{
        ...initialData,
        accountId: initialData.accountId ?? undefined,
        friendId: initialData.friendId ?? undefined,
      }}
      fields={formFields}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: statementId,
            createStatementSchema: values,
          });
        },
      }}
      refresh={refresh}
      schema={createStatementSchema}
      successToast={(result) => `${result.length} statement(s) updated`}
      titleText="Update Statement"
    />
  );
};
