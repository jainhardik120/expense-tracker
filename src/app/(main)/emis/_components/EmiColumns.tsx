'use client';

import { useState } from 'react';

import { type ColumnDef } from '@tanstack/react-table';
import { Info, Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import EmiDetails from './EmiDetails';
import { UpdateEmiForm } from './EmiForms';

type CreditCard = RouterOutput['accounts']['getCreditCards'][number];
type Emi = RouterOutput['emis']['getEmis']['emis'][number];

const EMIDetailsDialog = ({ emi }: { emi: Emi }) => {
  const [open, setOpen] = useState(false);
  return (
    <Modal
      className="min-w-106.25 sm:max-w-fit"
      open={open}
      setOpen={setOpen}
      title={emi.name}
      trigger={
        <Button className="size-8" size="icon" variant="ghost">
          <Info className="h-4 w-4" />
        </Button>
      }
    >
      <EmiDetails emi={emi} />
    </Modal>
  );
};

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
    accessorKey: 'maxInstallmentNo',
    header: 'Paid Upto',
  },
  {
    accessorKey: 'totalPaid',
    header: 'Total Paid',
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
          <EMIDetailsDialog emi={row.original} />
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
