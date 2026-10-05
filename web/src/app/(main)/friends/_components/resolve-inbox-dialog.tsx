'use client';

import { useRouter } from 'next/navigation';

import { z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { api } from '@/server/react';
import { type Account, type InboxResolution } from '@/types';

import { type InboxEntry } from './inbox-columns';

const resolveFormSchema = z
  .object({
    type: z.enum(['account', 'expense', 'cash', 'dismiss']),
    accountId: z.string(),
    category: z.string(),
    tags: z.string().array(),
  })
  .refine((values) => values.type !== 'account' || values.accountId !== '', {
    message: 'Pick the account it touched',
    path: ['accountId'],
  });

type ResolveFormValues = z.infer<typeof resolveFormSchema>;

const toResolution = (values: ResolveFormValues, single: boolean): InboxResolution => {
  const category =
    single && values.category.trim() !== ''
      ? { category: values.category.trim(), tags: values.tags }
      : {};
  if (values.type === 'account') {
    return { type: 'account', accountId: values.accountId, ...category };
  }
  if (values.type === 'expense') {
    return { type: 'expense', ...category };
  }
  if (values.type === 'cash') {
    return { type: 'cash', ...category };
  }
  return { type: 'dismiss' };
};

export const ResolveInboxDialog = ({
  entries,
  accountsData,
  categories,
  trigger,
}: {
  entries: InboxEntry[];
  accountsData: Account[];
  categories: string[];
  trigger: React.ReactNode;
}) => {
  const router = useRouter();
  const mutation = api.friends.resolveInboxEntries.useMutation();
  const pending = entries.filter((entry) => entry.status === 'pending');
  const single = pending.length === 1 ? pending[0] : undefined;
  const allIncoming = pending.every((entry) => Number(entry.amount) > 0);

  const fields: FormField<ResolveFormValues>[] = [
    {
      name: 'type',
      label: 'What was it on your side?',
      type: 'select',
      options: [
        { label: 'Through one of my accounts', value: 'account' },
        ...(allIncoming ? [{ label: 'They paid for something of mine', value: 'expense' }] : []),
        { label: 'Not through an account (cash)', value: 'cash' },
        { label: 'Ignore it', value: 'dismiss' },
      ],
    },
    {
      name: 'accountId',
      label: 'Account',
      type: 'select',
      placeholder: 'Select Account',
      options: accountsData.map((account) => ({ label: account.accountName, value: account.id })),
      displayCondition: (values) => values.type === 'account',
    },
    {
      name: 'category',
      label: 'Category',
      type: 'autocompleteInput',
      placeholder: 'Category',
      options: categories.map((category) => ({ label: category, value: category })),
      displayCondition: (values) => single !== undefined && values.type !== 'dismiss',
    },
    {
      name: 'tags',
      label: 'Tags',
      type: 'stringArray',
      placeholder: 'Tags',
      displayCondition: (values) => single !== undefined && values.type !== 'dismiss',
    },
  ];

  const defaultValues: ResolveFormValues = {
    type: 'account',
    accountId: '',
    category: single?.category ?? '',
    tags: single?.tags ?? [],
  };

  const count = pending.length;
  const transfers = count === 1 ? 'transfer' : 'transfers';
  const description =
    single === undefined
      ? `Applies to ${count} ${transfers}; each keeps the category your friend gave it.`
      : 'Your friend keeps control of the amount and date. The category and tags are yours.';

  return (
    <MutationModal
      button={trigger}
      customDescription={<p className="text-muted-foreground text-sm">{description}</p>}
      defaultValues={defaultValues}
      fields={fields}
      mapInput={(values) => ({
        ids: pending.map((entry) => entry.id),
        resolution: toResolution(values, single !== undefined),
      })}
      mutation={mutation}
      refresh={router.refresh}
      schema={resolveFormSchema}
      successToast={(result) =>
        `${result.resolved} transfer${result.resolved === 1 ? '' : 's'} resolved`
      }
      titleText={single === undefined ? `Resolve ${count} transfers` : 'Resolve transfer'}
    />
  );
};
