'use client';

import { useState } from 'react';

import { Calendar } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import Modal from '@/components/modal';
import { PaymentStatusBadge } from '@/components/payment-status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ZonedDate } from '@/components/zoned-date';
import { useDataTable } from '@/hooks/use-data-table';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { formatCurrency, DATE_FORMAT } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { type PaymentStatus, type RecurringPayment } from '@/types';

type RecurringPaymentDetailsDialogProps = {
  recurringPayment: RecurringPayment;
};

type Details = RouterOutput['recurringPayments']['getRecurringPaymentDetails'];

type PaymentRow = {
  key: string;
  scheduledDate: Date | null;
  expectedAmount: number | null;
  status: PaymentStatus | 'unscheduled';
  paidOn: Date | null;
  paidAmount: number | null;
  category: string | null;
};

const LoadingState = () => (
  <div className="text-muted-foreground py-8 text-center text-sm">Loading details...</div>
);

const ErrorState = ({ message }: { message: string }) => (
  <div className="py-8 text-center text-sm text-red-500">Error loading details: {message}</div>
);

const paymentRows = ({ schedule, linkedStatements }: Details): PaymentRow[] => {
  const statementById = new Map(linkedStatements.map((statement) => [statement.id, statement]));
  const scheduled = schedule.map((entry): PaymentRow => {
    const statement =
      entry.linkedStatementId === null ? undefined : statementById.get(entry.linkedStatementId);
    return {
      key: entry.scheduledDate.toISOString(),
      scheduledDate: entry.scheduledDate,
      expectedAmount: entry.expectedAmount,
      status: entry.status,
      paidOn: statement?.createdAt ?? null,
      paidAmount: statement === undefined ? null : Number(statement.amount),
      category: statement?.category ?? null,
    };
  });
  const matched = new Set(schedule.map((entry) => entry.linkedStatementId));
  const unscheduled = linkedStatements
    .filter((statement) => !matched.has(statement.id))
    .map((statement): PaymentRow => ({
      key: statement.id,
      scheduledDate: null,
      expectedAmount: null,
      status: 'unscheduled',
      paidOn: statement.createdAt,
      paidAmount: Number(statement.amount),
      category: statement.category,
    }));
  return [...scheduled, ...unscheduled];
};

const PaymentsTable = ({ rows }: { rows: PaymentRow[] }) => {
  const zoned = useZonedFormat();
  const { table } = useDataTable({
    data: rows,
    columns: [
      {
        id: 'scheduledDate',
        header: 'Due',
        accessorFn: (row: PaymentRow) =>
          row.scheduledDate === null ? '—' : zoned(row.scheduledDate, DATE_FORMAT.date),
      },
      {
        id: 'expectedAmount',
        header: 'Expected',
        accessorFn: (row: PaymentRow) =>
          row.expectedAmount === null ? '—' : formatCurrency(row.expectedAmount),
        meta: { align: 'right' as const },
      },
      {
        id: 'status',
        header: 'Status',
        // eslint-disable-next-line react/no-unstable-nested-components
        cell: ({ row }) =>
          row.original.status === 'unscheduled' ? (
            <Badge variant="outline">Not on schedule</Badge>
          ) : (
            <PaymentStatusBadge status={row.original.status} />
          ),
      },
      {
        id: 'paidOn',
        header: 'Paid on',
        accessorFn: (row: PaymentRow) =>
          row.paidOn === null ? '—' : zoned(row.paidOn, DATE_FORMAT.date),
      },
      {
        id: 'paidAmount',
        header: 'Amount paid',
        accessorFn: (row: PaymentRow) =>
          row.paidAmount === null ? '—' : formatCurrency(row.paidAmount),
        meta: { align: 'right' as const },
      },
      {
        id: 'category',
        header: 'Category',
        accessorFn: (row: PaymentRow) => row.category ?? '—',
      },
    ],
    pageCount: -1,
  });

  return (
    <DataTable
      background={false}
      enablePagination={false}
      getItemValue={(row) => row.key}
      showBorder={false}
      table={table}
    />
  );
};

export const RecurringPaymentDetailsDialog = ({
  recurringPayment,
  trigger,
}: RecurringPaymentDetailsDialogProps & { trigger: React.ReactNode }) => {
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
      <div className="space-y-6">
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
                    {data.nextPaymentDate !== null ? (
                      <ZonedDate value={data.nextPaymentDate} />
                    ) : (
                      'N/A'
                    )}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Payments</CardTitle>
            <CardDescription>
              Every due date from the start to the end of this year, with the statement that paid
              it. A statement within ±25% of the period of a due date is matched to it; a linked
              statement that matches no due date is listed at the end.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.schedule.length === 0 && data.linkedStatements.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                Nothing due and nothing paid yet.
              </p>
            ) : (
              <PaymentsTable rows={paymentRows(data)} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <Modal
      className="sm:max-w-3xl"
      open={open}
      setOpen={setOpen}
      title={`${recurringPayment.name} - Payment Schedule`}
      trigger={trigger}
    >
      {renderContent()}
    </Modal>
  );
};
