'use client';

import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { PAYMENT_STATUS_LABEL } from '@/components/payment-status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDataTable } from '@/hooks/use-data-table';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { formatCurrency, DATE_FORMAT } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';
import { type PaymentStatus } from '@/types';
import type { CardsWithOutstanding } from '@/types/router-outputs';

type SummaryData = Pick<RouterOutput['summary']['getAggregatedData'], 'accountsSummary'>;

type PeriodPayment = {
  key: string;
  type: 'EMI' | 'Recurring' | 'Credit Card Bill';
  name: string;
  source: string;
  date: Date;
  amount: number;
  myShare: number;
  status: PaymentStatus;
  absorbedByBill: boolean;
};

const BALANCE_BUFFER_RATIO = 1.2;

const STATUS_VARIANT: Record<PaymentStatus, 'default' | 'destructive' | 'secondary'> = {
  paid: 'secondary',
  missed: 'destructive',
  upcoming: 'default',
};

const StatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge variant={STATUS_VARIANT[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>
);

type ZonedFormat = (date: Date, pattern: string) => string;

const TYPE_LABEL: Record<PeriodPayment['type'], string> = {
  EMI: 'EMI',
  Recurring: 'Recurring',
  'Credit Card Bill': 'Bill',
};

const PaymentCell = ({ payment }: { payment: PeriodPayment }) => (
  <div className="min-w-0">
    <p className="truncate font-medium">{payment.name}</p>
    <p className="text-muted-foreground truncate text-xs">
      {TYPE_LABEL[payment.type]} • {payment.source}
    </p>
  </div>
);

const createPeriodPaymentColumns = (zoned: ZonedFormat) => [
  {
    id: 'payment',
    header: 'Payment',
    cell: ({ row }: { row: { original: PeriodPayment } }) => <PaymentCell payment={row.original} />,
  },
  {
    id: 'date',
    header: 'Date',
    accessorFn: (row: PeriodPayment) => zoned(row.date, DATE_FORMAT.day),
  },
  {
    id: 'myShare',
    header: 'My Share',
    accessorFn: (row: PeriodPayment) => formatCurrency(row.myShare),
    meta: { align: 'right' as const },
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }: { row: { original: PeriodPayment } }) => (
      <StatusBadge status={row.original.status} />
    ),
  },
];

export const PeriodPaymentsCard = ({
  creditData,
  summaryData,
}: {
  creditData: CardsWithOutstanding;
  summaryData: SummaryData;
}) => {
  const zoned = useZonedFormat();
  const { periodEmiPayments, periodRecurringPayments, periodCardBills, periodStart, periodEnd } =
    creditData;

  const payments = useMemo<PeriodPayment[]>(() => {
    const emiItems = periodEmiPayments.map((payment) => ({
      key: `emi-${payment.emiId}-${payment.installment}-${payment.date.toISOString()}`,
      type: 'EMI' as const,
      name: payment.emiName,
      source: payment.cardName,
      date: payment.date,
      amount: payment.amount,
      myShare: payment.myShare,
      status: payment.status,
      absorbedByBill: payment.absorbedByBill,
    }));
    const recurringItems = periodRecurringPayments.map((payment) => ({
      key: `recurring-${payment.id}-${payment.date.toISOString()}`,
      type: 'Recurring' as const,
      name: payment.name,
      source: payment.category,
      date: payment.date,
      amount: payment.amount,
      myShare: payment.amount,
      status: payment.status,
      absorbedByBill: false,
    }));
    const billItems = periodCardBills.map((bill) => ({
      key: `bill-${bill.cardId}-${bill.dueDate.toISOString()}`,
      type: 'Credit Card Bill' as const,
      name: bill.cardName,
      source: 'Card bill',
      date: bill.dueDate,
      amount: bill.billedAmount,
      myShare: bill.status === 'paid' ? bill.billedAmount : bill.remainingAmount,
      status: bill.status,
      absorbedByBill: false,
    }));

    return [...emiItems, ...recurringItems, ...billItems].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [periodCardBills, periodEmiPayments, periodRecurringPayments]);

  const totals = useMemo(() => {
    const sumMine = (type: PeriodPayment['type']) =>
      payments
        .filter((payment) => payment.type === type)
        .reduce((sum, payment) => sum + payment.myShare, 0);

    const emiTotal = sumMine('EMI');
    const recurringTotal = sumMine('Recurring');
    const cardBillTotal = sumMine('Credit Card Bill');

    const outstanding = payments
      .filter((payment) => payment.status !== 'paid' && !payment.absorbedByBill)
      .reduce((sum, payment) => sum + payment.myShare, 0);

    const creditCardAccountIds = new Set(creditData.cards.map((card) => card.accountId));
    const availableNonCreditBalance = summaryData.accountsSummary
      .filter((summary) => !creditCardAccountIds.has(summary.account.id))
      .reduce((sum, summary) => sum + Math.max(summary.finalBalance, 0), 0);

    return {
      emiTotal,
      recurringTotal,
      cardBillTotal,
      outstanding,
      availableNonCreditBalance,
      shortfall: outstanding - availableNonCreditBalance,
    };
  }, [creditData.cards, payments, summaryData.accountsSummary]);

  const warning = useMemo(() => {
    if (totals.shortfall > 0) {
      return {
        label: 'Low balance warning',
        message: `You are short by ${formatCurrency(totals.shortfall)} for the outstanding payments in this period.`,
        className: 'text-red-600',
      };
    }
    if (totals.availableNonCreditBalance < totals.outstanding * BALANCE_BUFFER_RATIO) {
      return {
        label: 'Low balance warning',
        message: 'Available balance is tight for the outstanding payments in this period.',
        className: 'text-amber-600',
      };
    }
    return {
      label: 'Balance status',
      message: 'Available balance is healthy for the outstanding payments in this period.',
      className: 'text-green-600',
    };
  }, [totals]);

  const { table } = useDataTable({
    data: payments,
    columns: createPeriodPaymentColumns(zoned),
    pageCount: -1,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
        <CardDescription>
          Everything due between {zoned(periodStart, DATE_FORMAT.date)} and{' '}
          {zoned(periodEnd, DATE_FORMAT.date)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground text-xs">Credit Card Bills</p>
            <p className="text-base font-semibold">{formatCurrency(totals.cardBillTotal)}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground text-xs">Recurring</p>
            <p className="text-base font-semibold">{formatCurrency(totals.recurringTotal)}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground text-xs">EMI</p>
            <p className="text-base font-semibold">{formatCurrency(totals.emiTotal)}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground text-xs">Still To Pay</p>
            <p className="text-base font-semibold">{formatCurrency(totals.outstanding)}</p>
          </div>
          <div className="col-span-2 rounded-lg border p-2">
            <p className="text-muted-foreground text-xs">Available Non-Credit Balance</p>
            <p className="text-base font-semibold">
              {formatCurrency(totals.availableNonCreditBalance)}
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-2">
          <p className="text-sm font-medium">{warning.label}</p>
          <p className={`text-sm ${warning.className}`}>{warning.message}</p>
        </div>

        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No payments due in this period.</p>
        ) : (
          <DataTable
            background={false}
            enablePagination={false}
            getItemValue={(r) => r.key}
            showBorder={false}
            table={table}
          />
        )}
      </CardContent>
    </Card>
  );
};
