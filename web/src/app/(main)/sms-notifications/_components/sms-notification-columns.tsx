'use client';

import { type ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { formatCurrency } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';

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

export const createSmsNotificationColumns = (): ColumnDef<SmsNotification>[] => [
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
  },
];
