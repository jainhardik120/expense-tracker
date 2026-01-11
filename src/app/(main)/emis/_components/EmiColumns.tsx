'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { type Emi } from '@/types';

import { UpdateEmiForm } from './EmiForms';

type CreditCard = RouterOutput['accounts']['getCreditCards'][number];

export const createEmiColumns = (
  refresh: () => void,
  creditCards: CreditCard[],
): ColumnDef<Emi>[] => [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'creditCardName',
    header: 'Credit Card',
  },
  {
    accessorKey: 'principal',
    header: 'Principal',
    cell: ({ row }) => formatCurrency(Number(row.original.principal)),
  },
  {
    accessorKey: 'tenure',
    header: 'Tenure (Months)',
  },
  {
    accessorKey: 'annualInterestRate',
    header: 'Interest Rate (%)',
  },
  {
    accessorKey: 'processingFees',
    header: 'Processing Fees',
    cell: ({ row }) => formatCurrency(Number(row.original.processingFees)),
  },
  {
    accessorKey: 'gst',
    header: 'GST (%)',
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const deleteMutation = api.emis.deleteEmi.useMutation();

      return (
        <div className="flex items-center gap-2">
          <UpdateEmiForm
            creditCards={creditCards}
            emiId={row.original.id}
            initialData={row.original}
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
