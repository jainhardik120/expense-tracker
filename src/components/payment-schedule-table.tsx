'use client';

import { useMemo } from 'react';

import { format, isSameMonth } from 'date-fns';

import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import { type EMICalculationResult } from '@/types';

type LinkedStatement = {
  id: string;
  amount: string;
  createdAt: Date;
};

type ScheduleRowWithPayment = EMICalculationResult['schedule'][number] & {
  paymentStatus: 'paid' | 'upcoming' | 'missed';
  linkedStatement?: LinkedStatement;
};

interface PaymentScheduleTableProps {
  result: EMICalculationResult;
  linkedStatements?: LinkedStatement[];
}

const StatusBadge = ({ status }: { status: 'paid' | 'upcoming' | 'missed' }) => {
  const variants: Record<string, 'default' | 'outline' | 'destructive'> = {
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

const renderStatusCell = (row: ScheduleRowWithPayment) => (
  <StatusBadge status={row.paymentStatus} />
);

// eslint-disable-next-line sonarjs/function-return-type
const renderPaidOnCell = (row: ScheduleRowWithPayment): React.ReactNode => {
  const stmt = row.linkedStatement;
  if (stmt === undefined) {
    return <span>-</span>;
  }
  return <span className="text-sm">{format(stmt.createdAt, 'dd MMM yyyy')}</span>;
};

const renderAmountPaidCell = (row: ScheduleRowWithPayment): string => {
  const stmt = row.linkedStatement;
  if (stmt === undefined) {
    return '-';
  }
  return formatCurrency(Number(stmt.amount));
};

export const PaymentScheduleTable = ({ result, linkedStatements }: PaymentScheduleTableProps) => {
  const showDates = useMemo(
    () => result.schedule.some((row) => row.date !== undefined),
    [result.schedule],
  );

  const scheduleWithPayments = useMemo<ScheduleRowWithPayment[]>(() => {
    if (linkedStatements === undefined || linkedStatements.length === 0) {
      const now = new Date();
      return result.schedule.map((row) => ({
        ...row,
        paymentStatus: row.date !== undefined && row.date < now ? 'missed' : 'upcoming',
      }));
    }

    const now = new Date();
    const usedStatements = new Set<string>();

    return result.schedule.map((row) => {
      if (row.date === undefined) {
        return { ...row, paymentStatus: 'upcoming' as const };
      }

      // Find a matching statement for this installment date
      const matchingStatement = linkedStatements.find((stmt) => {
        if (usedStatements.has(stmt.id)) {
          return false;
        }
        const scheduleDate = row.date;
        if (scheduleDate === undefined) {
          return false;
        }
        return isSameMonth(stmt.createdAt, scheduleDate);
      });

      if (matchingStatement !== undefined) {
        usedStatements.add(matchingStatement.id);
        return {
          ...row,
          paymentStatus: 'paid' as const,
          linkedStatement: matchingStatement,
        };
      }

      // Check if the payment date has passed
      if (row.date < now) {
        return { ...row, paymentStatus: 'missed' as const };
      }

      return { ...row, paymentStatus: 'upcoming' as const };
    });
  }, [result.schedule, linkedStatements]);

  const showPaymentStatus = linkedStatements !== undefined;

  const columns = useMemo(
    () => [
      {
        id: 'installment',
        header: 'Month',
        accessorFn: (row: ScheduleRowWithPayment) => row.installment,
      },
      ...(showDates
        ? [
            {
              id: 'date',
              header: 'Due Date',
              accessorFn: (row: ScheduleRowWithPayment) =>
                row.date === undefined ? '-' : format(row.date, 'dd MMM yyyy'),
            },
          ]
        : []),
      {
        id: 'emi',
        header: 'EMI',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.emi),
      },
      {
        id: 'interest',
        header: 'Interest',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.interest),
      },
      {
        id: 'principal',
        header: 'Principal',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.principal),
      },
      {
        id: 'gst',
        header: 'GST',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.gst),
      },
      {
        id: 'totalPayment',
        header: 'Total Payment',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.totalPayment),
      },
      {
        id: 'balance',
        header: 'Balance',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.balance),
      },
      ...(showPaymentStatus
        ? [
            {
              id: 'status',
              header: 'Status',
              cell: ({ row }: { row: { original: ScheduleRowWithPayment } }) =>
                renderStatusCell(row.original),
            },
            {
              id: 'paidOn',
              header: 'Paid On',
              cell: ({ row }: { row: { original: ScheduleRowWithPayment } }) =>
                renderPaidOnCell(row.original),
            },
            {
              id: 'amountPaid',
              header: 'Amount Paid',
              cell: ({ row }: { row: { original: ScheduleRowWithPayment } }) =>
                renderAmountPaidCell(row.original),
            },
          ]
        : []),
    ],
    [showDates, showPaymentStatus],
  );

  const { table } = useDataTable({
    data: scheduleWithPayments,
    columns,
    pageCount: -1,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Schedule</CardTitle>
        <CardDescription>Detailed month-by-month payment breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          background={false}
          enablePagination={false}
          getItemValue={(r) => String(r.installment)}
          showBorder={false}
          table={table}
        />
      </CardContent>
    </Card>
  );
};
