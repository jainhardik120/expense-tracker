'use client';

import { useMemo } from 'react';

import { isSameMonth } from 'date-fns';

import { DataTable } from '@/components/data-table/data-table';
import { PaymentStatusBadge } from '@/components/payment-status-badge';
import { useDataTable } from '@/hooks/use-data-table';
import { useZonedFormat, type ZonedFormat } from '@/hooks/use-zoned-format';
import { formatCurrency } from '@/lib/format';
import { type EMICalculationResult, type LinkedStatement, type PaymentStatus } from '@/types';

type ScheduleRowWithPayment = EMICalculationResult['schedule'][number] & {
  paymentStatus: PaymentStatus;
  linkedStatement?: LinkedStatement;
};

interface PaymentScheduleTableProps {
  result: EMICalculationResult;
  linkedStatements?: LinkedStatement[];
}

const renderStatusCell = (row: ScheduleRowWithPayment) => (
  <PaymentStatusBadge status={row.paymentStatus} />
);

// eslint-disable-next-line sonarjs/function-return-type
const renderPaidOnCell = (row: ScheduleRowWithPayment, zoned: ZonedFormat): React.ReactNode => {
  const stmt = row.linkedStatement;
  if (stmt === undefined) {
    return <span>-</span>;
  }
  return <span className="text-sm">{zoned(stmt.createdAt, 'dd MMM yyyy')}</span>;
};

const renderAmountPaidCell = (row: ScheduleRowWithPayment): string => {
  const stmt = row.linkedStatement;
  if (stmt === undefined) {
    return '-';
  }
  return formatCurrency(Number(stmt.amount));
};

export const PaymentScheduleTable = ({ result, linkedStatements }: PaymentScheduleTableProps) => {
  const zoned = useZonedFormat();
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
        meta: { align: 'right' as const },
      },
      ...(showDates
        ? [
            {
              id: 'date',
              header: 'Due Date',
              accessorFn: (row: ScheduleRowWithPayment) =>
                row.date === undefined ? '-' : zoned(row.date, 'dd MMM yyyy'),
            },
          ]
        : []),
      {
        id: 'emi',
        header: 'EMI',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.emi),
        meta: { align: 'right' as const },
      },
      {
        id: 'interest',
        header: 'Interest',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.interest),
        meta: { align: 'right' as const },
      },
      {
        id: 'principal',
        header: 'Principal',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.principal),
        meta: { align: 'right' as const },
      },
      {
        id: 'gst',
        header: 'GST',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.gst),
        meta: { align: 'right' as const },
      },
      {
        id: 'totalPayment',
        header: 'Total Payment',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.totalPayment),
        meta: { align: 'right' as const },
      },
      {
        id: 'balance',
        header: 'Balance',
        accessorFn: (row: ScheduleRowWithPayment) => formatCurrency(row.balance),
        meta: { align: 'right' as const },
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
                renderPaidOnCell(row.original, zoned),
            },
            {
              id: 'amountPaid',
              header: 'Amount Paid',
              cell: ({ row }: { row: { original: ScheduleRowWithPayment } }) =>
                renderAmountPaidCell(row.original),
              meta: { align: 'right' as const },
            },
          ]
        : []),
    ],
    [showDates, showPaymentStatus, zoned],
  );

  const { table } = useDataTable({
    data: scheduleWithPayments,
    columns,
    pageCount: -1,
  });

  return (
    <DataTable
      enablePagination={false}
      getItemValue={(r) => String(r.installment)}
      showBorder={false}
      table={table}
    />
  );
};
