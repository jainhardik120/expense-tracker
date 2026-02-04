'use client';

import { SquarePen } from 'lucide-react';
import { type z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type Account, createAccountSchema } from '@/types';

const fields: FormField<z.infer<typeof createAccountSchema>>[] = [
  {
    name: 'accountName',
    label: 'Account Name',
    type: 'input',
  },
  {
    name: 'startingBalance',
    label: 'Starting Balance',
    type: 'input',
    placeholder: '0',
  },
];

export const CreateAccountForm = ({ refresh }: { refresh?: () => void }) => {
  const mutation = api.accounts.createAccount.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          New Account
        </Button>
      }
      defaultValues={{
        startingBalance: '',
        accountName: '',
      }}
      fields={fields}
      mutation={mutation}
      refresh={refresh}
      schema={createAccountSchema}
      successToast={() => 'Account created successfully'}
    />
  );
};

export const UpdateAccountForm = ({
  refresh,
  accountId,
  initialData,
}: {
  refresh?: () => void;
  accountId: string;
  initialData: Account;
}) => {
  const mutation = api.accounts.updateAccount.useMutation();
  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" variant="ghost">
          <SquarePen />
        </Button>
      }
      defaultValues={initialData}
      fields={fields}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: accountId,
            createAccountSchema: values,
          });
        },
      }}
      refresh={refresh}
      schema={createAccountSchema}
      successToast={(result) => `${result.length} account(s) updated`}
      titleText="Update Account"
    />
  );
};
