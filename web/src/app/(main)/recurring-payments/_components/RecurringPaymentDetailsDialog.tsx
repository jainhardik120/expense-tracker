'use client';

import { useState } from 'react';

import { format } from 'date-fns';
import { Calendar, Eye } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import Modal from '@/components/modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency, formatDate } from '@/lib/format';
import { api } from '@/server/react';
import { type RecurringPayment } from '@/types';

const DATE_FORMAT = 'dd MMM yyyy';

type RecurringPaymentDetailsDialogProps = {
  recurringPayment: RecurringPayment;
};

type ScheduleEntry = {
  scheduledDate: Date;
  expectedAmount: number;
  status: 'paid' | 'upcoming' | 'missed';
  linkedStatementDate: Date | null;
  linkedStatementAmount: number | null;
};

type LinkedStatement = {
  id: string;
  createdAt: Date;
  amount: string;
  category: string;
  statementKind: string;
};

const StatusBadge = ({ status }: { status: 'paid' | 'upcoming' | 'missed' }) => {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    paid: 'default',
    upcoming: 'outline',
    missed: 'destructive',
  };

  const labels: Record<string, string> = {
    paid: 'Paid',
    upcoming: 'Upcoming',
    missed: 'Missed',
  };

  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
};

const LoadingState = () => (
  <div className="text-muted-foreground py-8 text-center text-sm">Loading details...</div>
);

const ErrorState = ({ message }: { message: string }) => (
  <div className="py-8 text-center text-sm text-red-500">Error loading details: {message}</div>
);

const ScheduleTable = ({ schedule }: { schedule: ScheduleEntry[] }) => {
  const { table } = useDataTable({
    data: schedule,
    columns: [
      {
        id: 'scheduledDate',
        header: 'Scheduled Date',
        accessorFn: (row: ScheduleEntry) => format(row.scheduledDate, DATE_FORMAT),
      },
      {
        id: 'expectedAmount',
        header: 'Expected Amount',
        accessorFn: (row: ScheduleEntry) => formatCurrency(row.expectedAmount),
      },
      {
        id: 'status',
        header: 'Status',
        // eslint-disable-next-line react/no-unstable-nested-components
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'linkedStatementDate',
        header: 'Actual Payment',
        accessorFn: (row: ScheduleEntry) =>
          row.linkedStatementDate !== null ? format(row.linkedStatementDate, DATE_FORMAT) : '-',
      },
      {
        id: 'linkedStatementAmount',
        header: 'Amount Paid',
        accessorFn: (row: ScheduleEntry) =>
          row.linkedStatementAmount !== null ? formatCurrency(row.linkedStatementAmount) : '-',
      },
    ],
    pageCount: -1,
  });

  return (
    <DataTable
      background={false}
      enablePagination={false}
      getItemValue={(r) => r.scheduledDate.toISOString()}
      showBorder={false}
      table={table}
    />
  );
};

const LinkedStatementsTable = ({ statements }: { statements: LinkedStatement[] }) => {
  const { table } = useDataTable({
    data: statements,
    columns: [
      {
        id: 'createdAt',
        header: 'Date',
        accessorFn: (row: LinkedStatement) => format(row.createdAt, DATE_FORMAT),
      },
      {
        id: 'amount',
        header: 'Amount',
        accessorFn: (row: LinkedStatement) => formatCurrency(Number(row.amount)),
      },
      {
        id: 'category',
        header: 'Category',
        accessorFn: (row: LinkedStatement) => row.category,
      },
      {
        id: 'statementKind',
        header: 'Type',
        // eslint-disable-next-line react/no-unstable-nested-components
        cell: ({ row }) => <Badge variant="secondary">{row.original.statementKind}</Badge>,
      },
    ],
    pageCount: -1,
  });

  return (
    <DataTable
      background={false}
      enablePagination={false}
      getItemValue={(r) => r.id}
      showBorder={false}
      table={table}
    />
  );
};

export const RecurringPaymentDetailsDialog = ({
  recurringPayment,
}: RecurringPaymentDetailsDialogProps) => {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = api.recurringPayments.getRecurringPaymentDetails.useQuery(
    { recurringPaymentId: recurringPayment.id },
    { enabled: open },
  );

  const renderContent = () => {
    if (isLoading) {
      return <LoadingState />;
    }

    if (error !== null) {
      return <ErrorState message={error.message} />;
    }

    if (data === undefined) {
      return null;
    }

    return (
      <ScrollArea className="max-h-[70vh]">
        <div className="space-y-6 pr-4">
          {/* Summary Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Payment Summary</CardTitle>
              <CardDescription>Overview of this recurring payment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <p className="text-muted-foreground text-sm">Expected Amount</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(data.recurringPayment.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Category</p>
                  <p className="text-lg font-semibold">{data.recurringPayment.category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Status</p>
                  <Badge variant={data.isActive ? 'default' : 'secondary'}>
                    {data.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Next Payment</p>
                  <div className="flex items-center gap-1">
                    <Calendar className="text-muted-foreground h-4 w-4" />
                    <span className="text-lg font-semibold">
                      {data.nextPaymentDate !== null ? formatDate(data.nextPaymentDate) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Schedule Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Payment Schedule (Current Year)</CardTitle>
              <CardDescription>
                Scheduled payments and their status. Payments within ±25% of the period are matched
                automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.schedule.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No scheduled payments for the current year.
                </p>
              ) : (
                <ScheduleTable schedule={data.schedule} />
              )}
            </CardContent>
          </Card>

          {/* Linked Statements */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Linked Statements</CardTitle>
              <CardDescription>All statements linked to this recurring payment</CardDescription>
            </CardHeader>
            <CardContent>
              {data.linkedStatements.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No statements linked yet. Link statements from the statements page.
                </p>
              ) : (
                <LinkedStatementsTable statements={data.linkedStatements} />
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  };

  return (
    <Modal
      className="sm:max-w-3xl"
      open={open}
      setOpen={setOpen}
      title={`${recurringPayment.name} - Payment Schedule`}
      trigger={
        <Button className="size-8" size="icon" variant="ghost">
          <Eye />
        </Button>
      }
    >
      {renderContent()}
    </Modal>
  );
};
