'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { UpdateRecurringPaymentForm } from './RecurringPaymentForms';

type RecurringPayment =
  RouterOutput['recurringPayments']['getRecurringPayments']['recurringPayments'][number];

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
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
  },
  {
    accessorKey: 'frequency',
    header: 'Frequency',
    cell: ({ row }) => frequencyLabels[row.original.frequency] ?? row.original.frequency,
  },
  {
    accessorKey: 'startDate',
    header: 'Start Date',
    cell: ({ row }) => formatDate(row.original.startDate),
  },
  {
    accessorKey: 'endDate',
    header: 'End Date',
    cell: ({ row }) => {
      if (row.original.endDate === null) {
        return 'N/A';
      }
      return formatDate(row.original.endDate);
    },
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
        {row.original.isActive ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const deleteMutation = api.recurringPayments.deleteRecurringPayment.useMutation();

      return (
        <div className="flex items-center gap-2">
          <UpdateRecurringPaymentForm
            initialData={row.original}
            recurringPaymentId={row.original.id}
            refresh={refresh}
          />
          <DeleteConfirmationDialog
            mutation={deleteMutation}
            mutationInput={{ id: row.original.id }}
            refresh={() => {
              refresh();
            }}
          >
            <Button className="size-8" size="icon" variant="ghost">
              <Trash />
            </Button>
          </DeleteConfirmationDialog>
        </div>
      );
    },
  },
];
