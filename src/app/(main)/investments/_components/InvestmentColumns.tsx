'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type Investment } from '@/types';

import { UpdateInvestmentForm } from './InvestmentForms';

export const createInvestmentColumns = (refresh: () => void): ColumnDef<Investment>[] => [
  {
    accessorKey: 'investmentKind',
    header: 'Kind',
  },
  {
    accessorKey: 'investmentDate',
    header: 'Investment Date',
    cell: ({ row }) => format(row.original.investmentDate, 'PPp'),
  },
  {
    accessorKey: 'investmentAmount',
    header: 'Investment Amount',
    cell: ({ row }) => `₹${row.original.investmentAmount}`,
  },
  {
    accessorKey: 'maturityDate',
    header: 'Maturity Date',
    cell: ({ row }) =>
      row.original.maturityDate === null ? '-' : format(row.original.maturityDate, 'PPp'),
  },
  {
    accessorKey: 'maturityAmount',
    header: 'Maturity Amount',
    cell: ({ row }) =>
      row.original.maturityAmount === null ? '-' : `₹${row.original.maturityAmount}`,
  },
  {
    accessorKey: 'amount',
    header: 'Current Amount',
    cell: ({ row }) => (row.original.amount === null ? '-' : `₹${row.original.amount}`),
  },
  {
    accessorKey: 'units',
    header: 'Units',
    cell: ({ row }) => row.original.units ?? '-',
  },
  {
    accessorKey: 'purchaseRate',
    header: 'Purchase Rate',
    cell: ({ row }) => (row.original.purchaseRate === null ? '-' : `₹${row.original.purchaseRate}`),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const deleteMutation = api.investments.deleteInvestment.useMutation();

      return (
        <div className="flex items-center gap-2">
          <UpdateInvestmentForm
            initialData={row.original}
            investmentId={row.original.id}
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
