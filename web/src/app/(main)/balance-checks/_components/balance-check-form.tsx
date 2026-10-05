'use client';

import { useRouter } from 'next/navigation';

import { z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { api } from '@/server/react';
import { amount } from '@/types';

export type CheckAccount = { accountId: string; accountName: string; isCreditCard: boolean };

const formSchema = z.object({
  accountId: z.string().min(1, 'Pick an account'),
  checkedAt: z.date(),
  balance: amount,
  note: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const fields = (accounts: CheckAccount[]): FormField<FormValues>[] => [
  {
    name: 'accountId',
    label: 'Account',
    type: 'select',
    placeholder: 'Select Account',
    options: accounts.map((account) => ({
      label: account.accountName,
      value: account.accountId,
    })),
  },
  {
    name: 'checkedAt',
    label: 'When you checked',
    type: 'datetime',
  },
  {
    name: 'balance',
    label: 'Balance the bank showed',
    type: 'number',
    placeholder: '0.00',
    description: 'For a credit card, enter the outstanding amount you owe.',
  },
  {
    name: 'note',
    label: 'Note',
    type: 'input',
    placeholder: 'Optional',
  },
];

const toStored = (accounts: CheckAccount[], values: FormValues) => {
  const isCard = accounts.find((account) => account.accountId === values.accountId)?.isCreditCard;
  const value = Number(values.balance);
  return {
    accountId: values.accountId,
    checkedAt: values.checkedAt,
    balance: (isCard === true ? -value : value).toString(),
    note: values.note.trim() === '' ? undefined : values.note.trim(),
  };
};

export const CreateBalanceCheckForm = ({
  accounts,
  trigger,
  accountId,
}: {
  accounts: CheckAccount[];
  trigger: React.ReactNode;
  accountId?: string;
}) => {
  const router = useRouter();
  const mutation = api.balanceChecks.createCheck.useMutation();
  return (
    <MutationModal
      button={trigger}
      defaultValues={{ accountId: accountId ?? '', checkedAt: new Date(), balance: '', note: '' }}
      fields={fields(accounts)}
      mapInput={(values) => toStored(accounts, values)}
      mutation={mutation}
      refresh={router.refresh}
      schema={formSchema}
      successToast={() => 'Balance check added'}
      titleText="Add balance check"
    />
  );
};

export const UpdateBalanceCheckForm = ({
  accounts,
  trigger,
  check,
}: {
  accounts: CheckAccount[];
  trigger: React.ReactNode;
  check: { id: string; accountId: string; checkedAt: Date; balance: number; note: string | null };
}) => {
  const router = useRouter();
  const mutation = api.balanceChecks.updateCheck.useMutation();
  const isCard = accounts.find((account) => account.accountId === check.accountId)?.isCreditCard;
  return (
    <MutationModal
      button={trigger}
      defaultValues={{
        accountId: check.accountId,
        checkedAt: check.checkedAt,
        balance: (isCard === true ? -check.balance : check.balance).toString(),
        note: check.note ?? '',
      }}
      fields={fields(accounts)}
      mapInput={(values) => ({ id: check.id, ...toStored(accounts, values) })}
      mutation={mutation}
      refresh={router.refresh}
      schema={formSchema}
      successToast={() => 'Balance check updated'}
      titleText="Edit balance check"
    />
  );
};
