'use client';

import { DataTable } from '@/components/data-table/data-table';
import { useTimezone } from '@/components/time-zone-setter';
import { useDataTable } from '@/hooks/use-data-table';
import { formatTruncatedDate } from '@/lib/date';
import { type DateTruncUnit, type ProcessedAggregationData } from '@/types';

const Table = ({ data, unit }: { data: ProcessedAggregationData[]; unit: DateTruncUnit }) => {
  const timezone = useTimezone();
  const { table } = useDataTable({
    data,
    pageCount: 1,
    columns: [
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => formatTruncatedDate(row.original.date, unit, timezone),
      },
      {
        accessorKey: 'totalAccountsSummary.startingBalance',
        header: 'Starting Account Balance',
        cell: ({ row }) => row.original.totalAccountsSummary.startingBalance.toFixed(2),
      },
      {
        accessorKey: 'totalAccountsSummary.finalBalance',
        header: 'Final Account Balance',
        cell: ({ row }) => row.original.totalAccountsSummary.finalBalance.toFixed(2),
      },
      {
        accessorKey: 'totalFriendsSummary.startingBalance',
        header: 'Starting Friends Balance',
        cell: ({ row }) => row.original.totalFriendsSummary.startingBalance.toFixed(2),
      },
      {
        accessorKey: 'totalFriendsSummary.finalBalance',
        header: 'Final Friends Balance',
        cell: ({ row }) => row.original.totalFriendsSummary.finalBalance.toFixed(2),
      },
      {
        accessorKey: 'totalAccountsSummary.outsideTransactions',
        header: 'Outside Transactions',
        cell: ({ row }) => row.original.totalAccountsSummary.outsideTransactions.toFixed(2),
      },
      {
        accessorKey: 'totalExpenses',
        header: 'Total Expenses',
        cell: ({ row }) => row.original.totalExpenses.toFixed(2),
      },
      {
        accessorFn: (row) => {
          return (
            row.totalAccountsSummary.finalBalance - row.totalFriendsSummary.finalBalance
          ).toFixed(2);
        },
        id: 'finalBalance',
        header: 'Final Balance',
      },
    ],
  });
  return (
    <DataTable enablePagination={false} getItemValue={(i) => i.date.toISOString()} table={table} />
  );
};

export default Table;
