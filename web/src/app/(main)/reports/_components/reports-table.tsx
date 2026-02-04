'use client';

import { useRouter } from 'next/navigation';

import { format, toZonedTime } from 'date-fns-tz';
import { Settings } from 'lucide-react';

import { aggregationTableColumns } from '@/components/aggregation-table-columns';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useTimezone } from '@/components/time-zone-setter';
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
import type { ProcessedAggregationData } from '@/types';

import { BoundaryListItem, CreateBoundaryForm } from './boundary-forms';

interface Boundary {
  id: string;
  userId: string;
  boundaryDate: Date;
  createdAt: Date;
}

interface ReportsTableProps {
  initialReport: ProcessedAggregationData[];
  initialBoundaries: Boundary[];
}

const ReportsTable = ({ initialReport, initialBoundaries }: ReportsTableProps) => {
  const timezone = useTimezone();
  const [, ...columns] = aggregationTableColumns('day', timezone);
  const { table } = useDataTable({
    data: initialReport,
    pageCount: 1,
    columns: [
      {
        id: 'date',
        header: 'Start Date',
        // eslint-disable-next-line react/no-unstable-nested-components
        cell: ({ row }) => {
          const { date } = row.original;
          const d = typeof date === 'string' ? new Date(date) : date;
          const zonedDate = toZonedTime(d, timezone);
          const formatStr = 'MMM dd, yyyy';
          const string = format(zonedDate, formatStr);
          return <p>{string}</p>;
        },
      },
      {
        id: 'endDate',
        header: 'End Date',
        // eslint-disable-next-line react/no-unstable-nested-components
        cell: ({ row }) => {
          const { endDate } = row.original;
          const d = typeof endDate === 'string' ? new Date(endDate) : endDate;
          const zonedDate = toZonedTime(d, timezone);
          const formatStr = 'MMM dd, yyyy';
          const string = format(zonedDate, formatStr);
          return <p>{string}</p>;
        },
      },
      ...columns,
    ],
  });
  const router = useRouter();
  return (
    <DataTable enablePagination={false} getItemValue={(i) => i.date.toISOString()} table={table}>
      <DataTableToolbar table={table}>
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
              <CreateBoundaryForm refresh={router.refresh} />
              <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
                {initialBoundaries.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    No boundaries defined. Add at least 2 boundaries to create report periods.
                  </p>
                ) : (
                  initialBoundaries.map((boundary) => (
                    <BoundaryListItem
                      key={boundary.id}
                      boundary={boundary}
                      refresh={router.refresh}
                    />
                  ))
                )}
              </div>
              {initialBoundaries.length > 0 && initialBoundaries.length < 2 && (
                <p className="text-muted-foreground text-center text-sm">
                  Add at least one more boundary to create a report period.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </DataTableToolbar>
    </DataTable>
  );
};

export default ReportsTable;
