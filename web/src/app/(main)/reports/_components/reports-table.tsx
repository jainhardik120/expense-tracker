'use client';

import { useRouter } from 'next/navigation';

import { format } from 'date-fns';
import { Settings } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useDataTable } from '@/hooks/use-data-table';
import { api } from '@/server/react';
import {
  type AggregatedAccountTransferSummary,
  type AggregatedFriendTransferSummary,
  MS_PER_DAY,
} from '@/types';

import { BoundaryListItem, CreateBoundaryForm } from './boundary-forms';

interface BucketSummary {
  startDate: Date;
  endDate: Date;
  accountsSummary: AggregatedAccountTransferSummary;
  friendsSummary: AggregatedFriendTransferSummary;
  myExpensesTotal: number;
}

interface Boundary {
  id: string;
  userId: string;
  boundaryDate: Date;
  createdAt: Date;
}

interface ReportsTableProps {
  initialReport: BucketSummary[];
  initialBoundaries: Boundary[];
}

const ReportsTable = ({ initialReport, initialBoundaries }: ReportsTableProps) => {
  const router = useRouter();
  const utils = api.useUtils();

  const { data: boundaries = initialBoundaries } = api.reports.getBoundaries.useQuery(undefined, {
    initialData: initialBoundaries,
  });

  const { data: reportData = initialReport } = api.reports.getAggregatedReport.useQuery(undefined, {
    initialData: initialReport,
  });

  const refresh = () => {
    void utils.reports.getBoundaries.invalidate();
    void utils.reports.getAggregatedReport.invalidate();
    router.refresh();
  };

  const { table } = useDataTable<BucketSummary>({
    data: reportData,
    pageCount: 1,
    columns: [
      {
        accessorKey: 'startDate',
        header: 'Start Date',
        cell: ({ row }) => format(row.original.startDate, 'MMM dd, yyyy'),
      },
      {
        accessorKey: 'endDate',
        header: 'End Date',
        cell: ({ row }) => format(row.original.endDate, 'MMM dd, yyyy'),
      },
      {
        id: 'duration',
        header: 'Duration',
        cell: ({ row }) => {
          const start = row.original.startDate;
          const end = row.original.endDate;
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / MS_PER_DAY);
          return `${diffDays} days`;
        },
      },
      {
        accessorKey: 'myExpensesTotal',
        header: 'My Expenses',
        cell: ({ row }) => row.original.myExpensesTotal.toFixed(2),
      },
      {
        id: 'myBalance',
        header: 'My Balance',
        cell: ({ row }) =>
          (
            row.original.accountsSummary.finalBalance - row.original.friendsSummary.finalBalance
          ).toFixed(2),
      },
      {
        accessorKey: 'friendsSummary.finalBalance',
        header: 'Friends Balance',
        cell: ({ row }) => row.original.friendsSummary.finalBalance.toFixed(2),
      },
      {
        accessorKey: 'accountsSummary.finalBalance',
        header: 'Total Balance',
        cell: ({ row }) => row.original.accountsSummary.finalBalance.toFixed(2),
      },
      {
        id: 'outsideTransactions',
        header: 'Outside Transactions',
        cell: ({ row }) =>
          (
            row.original.accountsSummary.outsideTransactions +
            row.original.accountsSummary.friendTransactions -
            row.original.friendsSummary.friendTransactions
          ).toFixed(2),
      },
      {
        accessorKey: 'accountsSummary.expenses',
        header: 'Account Expenses',
        cell: ({ row }) => row.original.accountsSummary.expenses.toFixed(2),
      },
      {
        accessorKey: 'friendsSummary.paidByFriend',
        header: 'Paid By Friends',
        cell: ({ row }) => row.original.friendsSummary.paidByFriend.toFixed(2),
      },
      {
        accessorKey: 'friendsSummary.splits',
        header: 'Splits',
        cell: ({ row }) => row.original.friendsSummary.splits.toFixed(2),
      },
    ],
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Custom Date Range Reports</h2>
          <p className="text-muted-foreground text-sm">
            View aggregated expense data between your custom date boundaries
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Settings className="mr-2 size-4" />
              Manage Date Boundaries
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Manage Date Boundaries</DialogTitle>
              <DialogDescription>
                Add or remove date boundaries to define your custom report periods. Each pair of
                consecutive dates creates a report bucket.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <CreateBoundaryForm refresh={refresh} />
              <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
                {boundaries.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    No boundaries defined. Add at least 2 boundaries to create report periods.
                  </p>
                ) : (
                  boundaries.map((boundary) => (
                    <BoundaryListItem key={boundary.id} boundary={boundary} refresh={refresh} />
                  ))
                )}
              </div>
              {boundaries.length > 0 && boundaries.length < 2 && (
                <p className="text-muted-foreground text-center text-sm">
                  Add at least one more boundary to create a report period.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {reportData.length === 0 ? (
        <div className="rounded-md border p-8 text-center">
          <p className="text-muted-foreground">
            No report data available. Define at least 2 date boundaries to generate reports.
          </p>
        </div>
      ) : (
        <DataTable
          enablePagination={false}
          getItemValue={(i) => `${i.startDate.toISOString()}-${i.endDate.toISOString()}`}
          table={table}
        />
      )}
    </div>
  );
};

export default ReportsTable;
