import { Fragment } from 'react';

import Link from 'next/link';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { formatTruncatedDate } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PeriodTotals } from '@/types';

import type { ColumnDef } from '@tanstack/react-table';

const statementsHref = (start: Date, end: Date, kinds: string[]) => {
  const params = new URLSearchParams({
    date: `${start.getTime()},${end.getTime()}`,
    statementKind: kinds.join(','),
  });
  return `/statements?${params.toString()}`;
};

const DrilldownLink = ({
  row,
  kinds,
  children,
  className,
  ...props
}: {
  row: PeriodTotals;
  kinds: string[];
} & Omit<React.ComponentProps<typeof Link>, 'href'>) => {
  const start = typeof row.date === 'string' ? new Date(row.date) : row.date;
  const end = typeof row.endDate === 'string' ? new Date(row.endDate) : row.endDate;
  return (
    <Link
      {...props}
      className={cn('underline-offset-4 hover:underline', className)}
      href={statementsHref(start, end, kinds)}
      prefetch={false}
    >
      {children}
    </Link>
  );
};

export const aggregationTableColumns = (
  unit: string,
  timezone: string,
): ColumnDef<PeriodTotals>[] => [
  {
    accessorKey: 'date',
    header: 'Date',
    cell: ({ row }) => formatTruncatedDate(row.original.date, unit, timezone),
  },
  {
    accessorFn: (row) => {
      return formatCurrency(
        row.totalAccountsSummary.finalBalance - row.totalFriendsSummary.finalBalance,
      );
    },
    id: 'finalBalance',
    header: 'My Balance',
    meta: { align: 'right' },
  },
  {
    accessorKey: 'totalFriendsSummary.finalBalance',
    header: 'Friends Balance',
    cell: ({ row }) => formatCurrency(row.original.totalFriendsSummary.finalBalance),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'totalAccountsSummary.finalBalance',
    header: 'Total Balance',
    cell: ({ row }) => formatCurrency(row.original.totalAccountsSummary.finalBalance),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'totalAccountsSummary.outsideTransactions',
    header: 'Outside Transactions',
    cell: ({ row }) => {
      return (
        <HoverCard closeDelay={200} openDelay={100}>
          <HoverCardTrigger asChild>
            <DrilldownLink kinds={['outside_transaction', 'friend_transaction']} row={row.original}>
              {formatCurrency(
                row.original.totalAccountsSummary.outsideTransactions +
                  row.original.totalAccountsSummary.friendTransactions -
                  row.original.totalFriendsSummary.friendTransactions,
              )}
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
                        <span>{formatCurrency(summary.outsideTransactions)}</span>
                      </div>
                    )}
                  </Fragment>
                );
              })}
              <div className="flex justify-between">
                <span>Friend Transactions:</span>
                <span>
                  {formatCurrency(
                    row.original.totalAccountsSummary.friendTransactions -
                      row.original.totalFriendsSummary.friendTransactions,
                  )}
                </span>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    },
    meta: { align: 'right' },
  },
  {
    accessorKey: 'totalExpenses',
    header: 'Total Expenses',
    cell: ({ row }) => {
      return (
        <HoverCard closeDelay={200} openDelay={100}>
          <HoverCardTrigger asChild>
            <DrilldownLink kinds={['expense']} row={row.original}>
              {formatCurrency(row.original.totalExpenses)}
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
                        <span>{formatCurrency(summary.expenses)}</span>
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
    meta: { align: 'right' },
  },
];
