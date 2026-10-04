'use client';

import { isBefore } from 'date-fns';
import { Eye, SquarePen, Trash } from 'lucide-react';

import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { ZonedDate } from '@/components/zoned-date';
import { formatCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { RecurringPaymentDetailsDialog } from './recurring-payment-details-dialog';
import { UpdateRecurringPaymentForm } from './recurring-payment-forms';

type RecurringPayment =
  RouterOutput['recurringPayments']['getRecurringPayments']['recurringPayments'][number];

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

const isActive = (payment: RecurringPayment): boolean => {
  if (payment.endDate === null) {
    return true;
  }
  const now = new Date();
  return isBefore(now, payment.endDate);
};

export const createRecurringPaymentColumns = (
  refresh: () => void,
): ColumnDef<RecurringPayment>[] => [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'category',
    header: 'Category',
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => formatCurrency(row.original.amount),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'frequency',
    header: 'Frequency',
    cell: ({ row }) => {
      const multiplier = parseFloat(row.original.frequencyMultiplier);
      const freqLabel = frequencyLabels[row.original.frequency] ?? row.original.frequency;
      if (multiplier === 1) {
        return freqLabel;
      }
      return `Every ${multiplier} ${freqLabel.toLowerCase()}`;
    },
  },
  {
    accessorKey: 'startDate',
    header: 'Start Date',
    cell: ({ row }) => <ZonedDate value={row.original.startDate} />,
  },
  {
    accessorKey: 'endDate',
    header: 'End Date',
    cell: ({ row }) => <ZonedDate fallback="N/A" value={row.original.endDate} />,
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const active = isActive(row.original);
      return (
        <Badge variant={active ? 'default' : 'secondary'}>{active ? 'Active' : 'Inactive'}</Badge>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const deleteMutation = api.recurringPayments.deleteRecurringPayment.useMutation();

      return (
        <RowActions>
          <RecurringPaymentDetailsDialog
            recurringPayment={row.original}
            trigger={<RowActionTrigger icon={Eye} label="Details" />}
          />
          <UpdateRecurringPaymentForm
            initialData={row.original}
            recurringPaymentId={row.original.id}
            refresh={refresh}
            trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
          />
          <DeleteConfirmationDialog
            mutation={deleteMutation}
            mutationInput={{ id: row.original.id }}
            refresh={() => {
              refresh();
            }}
          >
            <RowActionTrigger destructive icon={Trash} label="Delete" />
          </DeleteConfirmationDialog>
        </RowActions>
      );
    },
  },
];
