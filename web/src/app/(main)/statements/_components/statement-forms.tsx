'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

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
  isSharedStatement,
  type Statement,
  statementKindMap,
  statementParser,
} from '@/types';

type Lock = 'none' | 'all' | 'allButAccount';

const statementFormFields = (
  accountsData: Account[],
  friendsData: Friend[],
  categories: string[],
  lock: Lock = 'none',
): FormField<z.infer<typeof createStatementSchema>>[] => {
  const unlocked = lock === 'none';
  return [
    {
      name: 'statementKind',
      label: 'Statement Kind',
      type: 'select',
      displayCondition: unlocked,
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
      displayCondition: lock !== 'all',
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
      displayCondition: unlocked,
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
      displayCondition: unlocked,
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
      displayCondition: unlocked,
    },
  ];
};

export const CreateStatementForm = ({
  accountsData,
  friendsData,
  categories,
  defaultValues,
  onSuccess,
  trigger,
}: {
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  trigger?: React.ReactNode;
  defaultValues?: Partial<z.infer<typeof createStatementSchema>>;
  onSuccess?: (id: string) => Promise<void> | void;
}) => {
  const [searchParams] = useQueryStates(statementParser);
  const selectedAccount =
    searchParams.account.length === 1 &&
    accountsData.findIndex((account) => account.id === searchParams.account[0]) >= 0
      ? searchParams.account[0]
      : '';
  const mutation = api.statements.createStatement.useMutation();
  const formFields = useMemo(
    () => statementFormFields(accountsData, friendsData, categories),
    [accountsData, friendsData, categories],
  );
  const router = useRouter();
  return (
    <MutationModal
      button={
        trigger !== undefined ? (
          trigger
        ) : (
          <Button className="h-8" variant="outline">
            New Statement
          </Button>
        )
      }
      defaultValues={{
        amount: '',
        category: '',
        statementKind: 'expense',
        accountId: selectedAccount,
        friendId: '',
        tags: [],
        createdAt: new Date(),
        ...defaultValues,
      }}
      fields={formFields}
      mutation={mutation}
      refresh={async (result) => {
        await onSuccess?.(result[0].id);
        router.refresh();
      }}
      schema={createStatementSchema}
      successToast={(result) => `${result.length} statement(s) created`}
      titleText="Add Statement"
    />
  );
};

const UpdateSharedStatementForm = ({
  refresh,
  initialData,
  accountsData,
  friendsData,
  categories,
  trigger,
}: {
  refresh?: () => void;
  initialData: Statement;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  trigger: React.ReactNode;
}) => {
  const mutation = api.friends.updateSharedStatement.useMutation();
  const accountEditable =
    initialData.shareKind === 'answer' && initialData.statementKind === 'friend_transaction';
  const formFields = useMemo(
    () =>
      statementFormFields(
        accountsData,
        friendsData,
        categories,
        accountEditable ? 'allButAccount' : 'all',
      ),
    [accountsData, friendsData, categories, accountEditable],
  );
  const { shareKind } = initialData;
  if (shareKind === 'own') {
    return null;
  }
  return (
    <MutationModal
      button={trigger}
      customDescription={
        <p className="text-muted-foreground text-sm">
          {initialData.friendName ?? 'Your friend'} recorded this, so its amount and date come from
          their statement. The category and tags are yours.
        </p>
      }
      defaultValues={{
        ...initialData,
        accountId: initialData.accountId ?? undefined,
        friendId: initialData.friendId ?? undefined,
      }}
      fields={formFields}
      mapInput={(values) => ({
        shareKind,
        sourceId: initialData.id,
        category: values.category,
        tags: values.tags,
        ...(accountEditable ? { accountId: asOptionalAccount(values.accountId) } : {}),
      })}
      mutation={mutation}
      refresh={refresh}
      schema={createStatementSchema}
      successToast={() => 'Statement updated'}
      titleText="Update Statement"
    />
  );
};

const asOptionalAccount = (value: string | null | undefined) =>
  value === undefined || value === null || value === '' ? null : value;

export const UpdateStatementForm = ({
  refresh,
  statementId,
  initialData,
  accountsData,
  friendsData,
  categories,
  trigger,
}: {
  refresh?: () => void;
  statementId: string;
  initialData: Statement;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  trigger: React.ReactNode;
}) => {
  const mutation = api.statements.updateStatement.useMutation();
  const formFields = useMemo(
    () => statementFormFields(accountsData, friendsData, categories),
    [accountsData, friendsData, categories],
  );
  if (isSharedStatement(initialData)) {
    return (
      <UpdateSharedStatementForm
        accountsData={accountsData}
        categories={categories}
        friendsData={friendsData}
        initialData={initialData}
        refresh={refresh}
        trigger={trigger}
      />
    );
  }
  return (
    <MutationModal
      button={trigger}
      defaultValues={{
        ...initialData,
        accountId: initialData.accountId ?? undefined,
        friendId: initialData.friendId ?? undefined,
      }}
      fields={formFields}
      mapInput={(values) => ({ ...values, id: statementId })}
      mutation={mutation}
      refresh={refresh}
      schema={createStatementSchema}
      successToast={(result) => `${result.length} statement(s) updated`}
      titleText="Update Statement"
    />
  );
};
