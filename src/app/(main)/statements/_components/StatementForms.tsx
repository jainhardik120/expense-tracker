'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { SquarePen } from 'lucide-react';
import { useQueryStates } from 'nuqs';
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
  statementParser,
} from '@/types';

const statementFormFields = (
  accountsData: Account[],
  friendsData: Friend[],
  categories: string[],
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
      type: 'autocompleteInput',
      placeholder: 'Category',
      options: categories.map((category) => ({ label: category, value: category })),
    },
    {
      name: 'amount',
      label: 'Amount',
      type: 'number',
      placeholder: 'Amount',
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
  categories,
}: {
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}) => {
  const [searchParams] = useQueryStates(statementParser);
  const selectedAccount =
    searchParams.account.length === 1 &&
    accountsData.findIndex((account) => account.id === searchParams.account[0]) > 0
      ? searchParams.account[0]
      : '';
  const mutation = api.statements.addStatement.useMutation();
  const formFields = useMemo(
    () => statementFormFields(accountsData, friendsData, categories),
    [accountsData, friendsData, categories],
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
        accountId: selectedAccount,
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
  categories,
}: {
  refresh?: () => void;
  statementId: string;
  initialData: Statement;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}) => {
  const mutation = api.statements.updateStatement.useMutation();
  const formFields = useMemo(
    () => statementFormFields(accountsData, friendsData, categories),
    [accountsData, friendsData, categories],
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
