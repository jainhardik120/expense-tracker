import { Fragment } from 'react';

import Link from 'next/link';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { formatTruncatedDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { ProcessedAggregationData } from '@/types';

import type { ColumnDef } from '@tanstack/react-table';

// The statements page reads these straight off the URL via statementParser, and
// its date-range filter stores epoch milliseconds joined by a comma. Reusing the
// row's own start/end keeps the linked view lined up with the numbers shown here.
const statementsHref = (start: Date, end: Date, kinds: string[]) => {
  const params = new URLSearchParams({
    date: `${start.getTime()},${end.getTime()}`,
    statementKind: kinds.join(','),
  });
  return `/statements?${params.toString()}`;
};

// Rendered under HoverCardTrigger asChild, so every prop Radix hands down (the
// hover/focus handlers that open the card, plus its ref) has to reach the anchor.
const DrilldownLink = ({
  row,
  kinds,
  children,
  className,
  ...props
}: {
  row: ProcessedAggregationData;
  kinds: string[];
} & Omit<React.ComponentProps<typeof Link>, 'href'>) => {
  const start = typeof row.date === 'string' ? new Date(row.date) : row.date;
  const end = typeof row.endDate === 'string' ? new Date(row.endDate) : row.endDate;
  return (
    <Link
      {...props}
      className={cn('underline-offset-4 hover:underline', className)}
      href={statementsHref(start, end, kinds)}
    >
      {children}
    </Link>
  );
};

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
          <HoverCardTrigger asChild>
            {/* The figure combines outside and friend transactions, so the
                drill-down has to include both kinds to reconcile. */}
            <DrilldownLink
              kinds={['outside_transaction', 'friend_transaction']}
              row={row.original}
            >
              {(
                row.original.totalAccountsSummary.outsideTransactions +
                row.original.totalAccountsSummary.friendTransactions -
                row.original.totalFriendsSummary.friendTransactions
              ).toFixed(2)}
            </DrilldownLink>
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
          <HoverCardTrigger asChild>
            <DrilldownLink kinds={['expense']} row={row.original}>
              {row.original.totalExpenses.toFixed(2)}
            </DrilldownLink>
          </HoverCardTrigger>
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
