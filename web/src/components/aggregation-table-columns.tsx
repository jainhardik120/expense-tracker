import { Fragment } from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
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
    cell: ({ row }) => {
      return (
        <HoverCard closeDelay={200} openDelay={100}>
          <HoverCardTrigger>
            {(
              row.original.totalAccountsSummary.outsideTransactions +
              row.original.totalAccountsSummary.friendTransactions -
              row.original.totalFriendsSummary.friendTransactions
            ).toFixed(2)}
          </HoverCardTrigger>
          <HoverCardContent className="text-sm">
            <div className="flex flex-col gap-2">
              {Object.entries(row.original.categoryWiseSummary).map(([category, summary]) => {
                return (
                  <Fragment key={category}>
                    {summary.outsideTransactions !== 0 && (
                      <div className="flex justify-between">
                        <span>{category}:</span>
                        <span>{summary.outsideTransactions.toFixed(2)}</span>
                      </div>
                    )}
                  </Fragment>
                );
              })}
              <div className="flex justify-between">
                <span>Friend Transactions:</span>
                <span>
                  {(
                    row.original.totalAccountsSummary.friendTransactions -
                    row.original.totalFriendsSummary.friendTransactions
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    },
  },
  {
    accessorKey: 'totalExpenses',
    header: 'Total Expenses',
    cell: ({ row }) => {
      return (
        <HoverCard closeDelay={200} openDelay={100}>
          <HoverCardTrigger>{row.original.totalExpenses.toFixed(2)}</HoverCardTrigger>
          <HoverCardContent className="text-sm">
            <div className="flex flex-col gap-2">
              {Object.entries(row.original.categoryWiseSummary).map(([category, summary]) => {
                return (
                  <Fragment key={category}>
                    {summary.expenses !== 0 && (
                      <div className="flex justify-between">
                        <span>{category}:</span>
                        <span>{summary.expenses.toFixed(2)}</span>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    },
  },
];
