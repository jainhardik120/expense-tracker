'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { FileText, RefreshCw, Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { smsTransactionStatusEnum } from '@/db/schema';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { formatCurrency } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import type { Account, Friend } from '@/types';

import { CreateSelfTransferStatementForm } from '../../statements/_components/SelfTransferStatementForms';
import { CreateStatementForm } from '../../statements/_components/StatementForms';

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

const JunkNotificationButton = ({
  notificationId,
  onRefresh,
}: {
  notificationId: string;
  onRefresh: () => void;
}) => {
  const mutation = api.smsNotifications.update.useMutation();
  return (
    <DeleteConfirmationDialog
      description="This will mark the notification as junked. You can still view it in the list with status filter."
      mutation={mutation}
      mutationInput={{ id: notificationId, status: 'junked' }}
      refresh={onRefresh}
      successToast={() => 'Notification junked successfully'}
      title="Junk this notification?"
    >
      <Button className="size-8" size="icon" title="Junk notification" variant="ghost">
        <Trash />
      </Button>
    </DeleteConfirmationDialog>
  );
};

const ConvertToStatementButton = ({
  notification,
  accountsData,
  friendsData,
  categories,
}: {
  notification: SmsNotification;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}) => {
  const mutation = api.smsNotifications.update.useMutation();
  return (
    <CreateStatementForm
      accountsData={accountsData}
      categories={categories}
      defaultValues={{
        amount: notification.amount,
        createdAt: notification.createdAt,
      }}
      friendsData={friendsData}
      trigger={
        <Button className="size-8" size="icon" variant="ghost">
          <FileText />
        </Button>
      }
      onSuccess={async (id) => {
        await mutation.mutateAsync({
          id: notification.id,
          statementId: id,
          status: 'inserted',
        });
      }}
    />
  );
};

const ConvertToSelfTransferButton = ({
  notification,
  accountsData,
}: {
  notification: SmsNotification;
  accountsData: Account[];
}) => {
  const mutation = api.smsNotifications.update.useMutation();
  return (
    <CreateSelfTransferStatementForm
      accountsData={accountsData}
      defaultValues={{
        amount: notification.amount,
        createdAt: notification.createdAt,
      }}
      trigger={
        <Button className="size-8" size="icon" variant="ghost">
          <RefreshCw />
        </Button>
      }
      onSuccess={async (id) => {
        await mutation.mutateAsync({
          id: notification.id,
          statementId: id,
          status: 'inserted',
        });
      }}
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
      />
      <ConvertToSelfTransferButton accountsData={accountsData} notification={notification} />
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
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => {
      const date = row.original.createdAt;
      return <DateCell date={date} />;
    },
    id: 'date',
    meta: {
      label: 'Date',
      variant: 'dateRange',
    },
    enableColumnFilter: true,
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
