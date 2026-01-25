'use client';

import { useMemo } from 'react';

import { type ColumnDef } from '@tanstack/react-table';
import { Ban, FileText, RefreshCw } from 'lucide-react';
import { type z } from 'zod';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { smsTransactionStatusEnum } from '@/db/schema';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { formatCurrency } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import {
  type Account,
  createSelfTransferSchema,
  createStatementSchema,
  type Friend,
  statementKindMap,
} from '@/types';

type SmsNotification = RouterOutput['smsNotifications']['list']['notifications'][number];

const typeLabels: Record<string, string> = {
  income: 'Income',
  expense: 'Expense',
  credit: 'Credit',
  transfer: 'Transfer',
  investment: 'Investment',
};

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  inserted: 'default',
  junked: 'destructive',
};

const DateCell = ({ date }: { date: Date }) => {
  const isMounted = useIsMounted();
  return isMounted
    ? new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';
};

const SELECT_ACCOUNT_PLACEHOLDER = 'Select Account';

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
      placeholder: SELECT_ACCOUNT_PLACEHOLDER,
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

const selfTransferFormFields = (
  accountsData: Account[],
): FormField<z.infer<typeof createSelfTransferSchema>>[] => {
  return [
    {
      name: 'fromAccountId',
      label: 'From Account',
      type: 'select',
      placeholder: SELECT_ACCOUNT_PLACEHOLDER,
      options: accountsData.map((account) => ({
        label: account.accountName,
        value: account.id,
      })),
    },
    {
      name: 'toAccountId',
      label: 'To Account',
      type: 'select',
      placeholder: SELECT_ACCOUNT_PLACEHOLDER,
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

const JunkNotificationButton = ({
  notificationId,
  onRefresh,
}: {
  notificationId: string;
  onRefresh: () => void;
}) => {
  const mutation = api.smsNotifications.junk.useMutation();
  return (
    <DeleteConfirmationDialog
      description="This will mark the notification as junked. You can still view it in the list with status filter."
      mutation={mutation}
      mutationInput={{ id: notificationId }}
      refresh={onRefresh}
      successToast={() => 'Notification junked successfully'}
      title="Junk this notification?"
    >
      <Button className="size-8" size="icon" title="Junk notification" variant="ghost">
        <Ban />
      </Button>
    </DeleteConfirmationDialog>
  );
};

const ConvertToStatementButton = ({
  notification,
  onRefresh,
  accountsData,
  friendsData,
  categories,
}: {
  notification: SmsNotification;
  onRefresh: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}) => {
  const mutation = api.smsNotifications.convertToStatement.useMutation();
  const formFields = useMemo(
    () => statementFormFields(accountsData, friendsData, categories),
    [accountsData, friendsData, categories],
  );

  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" title="Convert to statement" variant="ghost">
          <FileText />
        </Button>
      }
      defaultValues={{
        amount: notification.amount,
        category: '',
        statementKind: 'expense',
        accountId: '',
        friendId: '',
        tags: [notification.merchant ?? ''],
        createdAt: new Date(notification.timestamp),
      }}
      fields={formFields}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: notification.id,
            statement: values,
          });
        },
      }}
      refresh={onRefresh}
      schema={createStatementSchema}
      successToast={(result) => `${result.length} statement(s) created`}
      titleText="Convert to Statement"
    />
  );
};

const ConvertToSelfTransferButton = ({
  notification,
  onRefresh,
  accountsData,
}: {
  notification: SmsNotification;
  onRefresh: () => void;
  accountsData: Account[];
}) => {
  const mutation = api.smsNotifications.convertToSelfTransfer.useMutation();
  const formFields = useMemo(() => selfTransferFormFields(accountsData), [accountsData]);

  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" title="Convert to self transfer" variant="ghost">
          <RefreshCw />
        </Button>
      }
      defaultValues={{
        toAccountId: '',
        fromAccountId: '',
        amount: notification.amount,
        createdAt: new Date(notification.timestamp),
      }}
      fields={formFields}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: notification.id,
            selfTransfer: values,
          });
        },
      }}
      refresh={onRefresh}
      schema={createSelfTransferSchema}
      successToast={(result) => `${result.length} self transfer(s) created`}
      titleText="Convert to Self Transfer"
    />
  );
};

const SmsNotificationActions = ({
  notification,
  onRefresh,
  accountsData,
  friendsData,
  categories,
}: {
  notification: SmsNotification;
  onRefresh: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}) => {
  if (notification.status !== 'pending') {
    return null;
  }

  return (
    <div className="flex flex-row gap-2">
      <ConvertToStatementButton
        accountsData={accountsData}
        categories={categories}
        friendsData={friendsData}
        notification={notification}
        onRefresh={onRefresh}
      />
      <ConvertToSelfTransferButton
        accountsData={accountsData}
        notification={notification}
        onRefresh={onRefresh}
      />
      <JunkNotificationButton notificationId={notification.id} onRefresh={onRefresh} />
    </div>
  );
};

export const createSmsNotificationColumns = ({
  onRefresh,
  accountsData,
  friendsData,
  categories,
}: {
  onRefresh: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}): ColumnDef<SmsNotification>[] => [
  {
    accessorKey: 'timestamp',
    header: 'Date',
    cell: ({ row }) => <DateCell date={row.original.timestamp} />,
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="outline">{typeLabels[row.original.type] ?? row.original.type}</Badge>
    ),
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => formatCurrency(row.original.amount, row.original.currency),
  },
  {
    accessorKey: 'merchant',
    header: 'Merchant',
    cell: ({ row }) => row.original.merchant ?? '-',
  },
  {
    accessorKey: 'bankName',
    header: 'Bank',
  },
  {
    accessorKey: 'accountLast4',
    header: 'Account',
    cell: ({ row }) =>
      row.original.accountLast4 !== null && row.original.accountLast4 !== ''
        ? `****${row.original.accountLast4}`
        : '-',
  },
  {
    accessorKey: 'sender',
    header: 'Sender',
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const { status } = row.original;
      return (
        <Badge variant={statusVariants[status] ?? 'secondary'}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      );
    },
    meta: {
      label: 'Status',
      variant: 'multiSelect',
      options: smsTransactionStatusEnum.enumValues.map((status) => ({
        label: status,
        value: status,
      })),
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'actions',
    header: '',
    cell: ({ row }) => {
      return (
        <div className="flex w-full justify-end">
          <SmsNotificationActions
            accountsData={accountsData}
            categories={categories}
            friendsData={friendsData}
            notification={row.original}
            onRefresh={onRefresh}
          />
        </div>
      );
    },
    meta: {
      label: 'Actions',
    },
    enableHiding: false,
  },
];
