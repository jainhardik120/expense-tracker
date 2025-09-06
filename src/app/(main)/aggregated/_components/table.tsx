'use client';

import DataTable from '@/components/ui/data-table';
import { formatTruncatedDate } from '@/lib/date';
import { type DateTruncUnit, type ProcessedAggregationData } from '@/types';

const Table = ({ data, unit }: { data: ProcessedAggregationData[]; unit: DateTruncUnit }) => {
  return (
    <DataTable
      columns={[
        {
          accessorKey: 'date',
          header: 'Date',
          cell: ({ row }) => formatTruncatedDate(row.original.date, unit),
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
      ]}
      data={data}
      filterOn="date"
      name="Table"
    />
  );
};

export default Table;
