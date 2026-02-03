import { formatTruncatedDate } from '@/lib/date';
import type { ProcessedAggregationData } from '@/types';

import type { ColumnDef } from '@tanstack/react-table';

export const aggregationTableColumns = (
  unit: string,
  timezone: string,
): ColumnDef<ProcessedAggregationData>[] => [
  {
    accessorKey: 'date',
    header: 'Date',
    cell: ({ row }) => formatTruncatedDate(row.original.date, unit, timezone),
  },
  {
    accessorFn: (row) => {
      return (row.totalAccountsSummary.finalBalance - row.totalFriendsSummary.finalBalance).toFixed(
        2,
      );
    },
    id: 'finalBalance',
    header: 'My Balance',
  },
  {
    accessorKey: 'totalFriendsSummary.finalBalance',
    header: 'Friends Balance',
    cell: ({ row }) => row.original.totalFriendsSummary.finalBalance.toFixed(2),
  },
  {
    accessorKey: 'totalAccountsSummary.finalBalance',
    header: 'Total Balance',
    cell: ({ row }) => row.original.totalAccountsSummary.finalBalance.toFixed(2),
  },
  {
    accessorKey: 'totalAccountsSummary.outsideTransactions',
    header: 'Outside Transactions',
    cell: ({ row }) =>
      (
        row.original.totalAccountsSummary.outsideTransactions +
        row.original.totalAccountsSummary.friendTransactions -
        row.original.totalFriendsSummary.friendTransactions
      ).toFixed(2),
  },
  {
    accessorKey: 'totalExpenses',
    header: 'Total Expenses',
    cell: ({ row }) => row.original.totalExpenses.toFixed(2),
  },
];
