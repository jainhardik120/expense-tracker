'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { FileText, RefreshCw, Trash } from 'lucide-react';

import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { useTimezone } from '@/components/time-zone-setter';
import { Badge } from '@/components/ui/badge';
import { smsTransactionStatuses } from '@/db/enums';
import { zonedFormat } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import type { Account, Friend } from '@/types';

import { SMS_COLUMN_SIZE } from './column-sizes';

import { CreateSelfTransferStatementForm } from '../../statements/_components/SelfTransferStatementForms';
import { CreateStatementForm } from '../../statements/_components/StatementForms';

type SmsNotification = RouterOutput['smsNotifications']['list']['notifications'][number];

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  inserted: 'default',
  junked: 'destructive',
};

/** Printed from the reader's zone on both sides, so the column never resizes. */
const DateCell = ({ date }: { date: Date }) => {
  const timezone = useTimezone();
  return zonedFormat(date, "MMM dd, yyyy 'at' hh:mm a", timezone);
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
      <RowActionTrigger destructive icon={Trash} label="Junk" />
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
  const { data: hints, refetch } = api.smsNotifications.getInsertHints.useQuery(
    { id: notification.id },
    { enabled: false },
  );
  return (
    <CreateStatementForm
      accountsData={accountsData}
      categories={categories}
      defaultValues={{
        amount: notification.amount,
        createdAt: notification.createdAt,
        accountId: (hints?.bankIdHint.length ?? 0) > 0 ? hints?.bankIdHint[0] : '',
        category: (hints?.categoryHint.length ?? 0) > 0 ? hints?.categoryHint[0] : '',
        tags: (hints?.tagsHint.length ?? 0) > 0 ? [hints?.tagsHint[0] ?? ''] : [],
      }}
      friendsData={friendsData}
      trigger={
        <RowActionTrigger
          icon={FileText}
          label="As statement"
          onClick={() => {
            void refetch();
          }}
        />
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
      trigger={<RowActionTrigger icon={RefreshCw} label="As self transfer" />}
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
    <RowActions>
      <ConvertToStatementButton
        accountsData={accountsData}
        categories={categories}
        friendsData={friendsData}
        notification={notification}
      />
      <ConvertToSelfTransferButton accountsData={accountsData} notification={notification} />
      <JunkNotificationButton notificationId={notification.id} onRefresh={onRefresh} />
    </RowActions>
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
    // Empty, and exactly as wide as the tick box the editor puts here. Without
    // it every column after it would jump sideways the moment editing starts.
    id: 'select',
    size: SMS_COLUMN_SIZE.gutter,
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: () => null,
  },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    size: SMS_COLUMN_SIZE.date,
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
    accessorKey: 'amount',
    header: 'Amount',
    size: SMS_COLUMN_SIZE.amount,
    cell: ({ row }) => formatCurrency(row.original.amount, row.original.currency),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'merchant',
    header: 'Merchant',
    size: SMS_COLUMN_SIZE.merchant,
    cell: ({ row }) => row.original.merchant ?? '-',
  },
  {
    accessorKey: 'bankName',
    header: 'Bank',
    size: SMS_COLUMN_SIZE.bank,
  },
  {
    accessorKey: 'accountLast4',
    header: 'Account',
    size: SMS_COLUMN_SIZE.account,
    cell: ({ row }) =>
      row.original.accountLast4 !== null && row.original.accountLast4 !== ''
        ? row.original.accountLast4
        : '-',
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    size: SMS_COLUMN_SIZE.status,
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
      options: smsTransactionStatuses.map((status) => ({
        label: status,
        value: status,
      })),
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'actions',
    header: '',
    size: SMS_COLUMN_SIZE.actions,
    cell: ({ row }) => {
      return (
        <SmsNotificationActions
          accountsData={accountsData}
          categories={categories}
          friendsData={friendsData}
          notification={row.original}
          onRefresh={onRefresh}
        />
      );
    },
    meta: {
      label: 'Actions',
    },
    enableHiding: false,
  },
];
