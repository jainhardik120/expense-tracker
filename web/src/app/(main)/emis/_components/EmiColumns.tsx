'use client';

import { useState } from 'react';

import { type ColumnDef } from '@tanstack/react-table';
import { Info, SquarePen, SquareSlash, Trash } from 'lucide-react';

import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import Modal from '@/components/modal';
import { formatCurrency, formatDate } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import type { CreditCard } from '@/types/router-outputs';

import EmiDetails from './EmiDetails';
import { UpdateEmiForm } from './EmiForms';
import { EmiSplitsDialog } from './EmiSplits';

type Emi = RouterOutput['emis']['getEmis']['emis'][number];

const EMIDetailsDialog = ({ emi, trigger }: { emi: Emi; trigger: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <Modal
      className="min-w-106.25 sm:max-w-fit"
      open={open}
      setOpen={setOpen}
      title={emi.name}
      trigger={trigger}
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
    cell: ({ row }) => formatCurrency(row.original.principal),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'processingFees',
    header: 'Processing Fees',
    cell: ({ row }) => formatCurrency(row.original.processingFees),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'monthlyEMI',
    header: 'Monthly EMI',
    cell: ({ row }) => formatCurrency(row.original.monthlyEMI),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'tenure',
    header: 'Tenure',
    meta: { align: 'right' },
  },
  {
    accessorKey: 'maxInstallmentNo',
    header: 'Paid Upto',
    meta: { align: 'right' },
  },
  {
    accessorKey: 'outstandingBalance',
    header: 'Outstanding Balance',
    cell: ({ row }) => formatCurrency(row.original.outstandingBalance),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'totalPaid',
    header: 'Total Paid',
    cell: ({ row }) => formatCurrency(row.original.totalPaid ?? '0'),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'amountLeftToBePaid',
    header: 'Amount Left',
    cell: ({ row }) => formatCurrency(row.original.amountLeftToBePaid),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'nextPaymentOn',
    header: 'Next Date',
    cell: ({ row }) =>
      row.original.nextPaymentOn === null ? '' : formatDate(row.original.nextPaymentOn),
  },
  {
    accessorKey: 'nextPaymentAmount',
    header: 'Next Payment',
    cell: ({ row }) =>
      row.original.nextPaymentAmount === null ? '' : formatCurrency(row.original.nextPaymentAmount),
    meta: { align: 'right' },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const deleteMutation = api.emis.deleteEmi.useMutation();

      return (
        <RowActions>
          <UpdateEmiForm
            creditCards={creditCards}
            emiId={row.original.id}
            initialData={row.original}
            refresh={refresh}
            trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
          />
          <EMIDetailsDialog
            emi={row.original}
            trigger={<RowActionTrigger icon={Info} label="Details" />}
          />
          <EmiSplitsDialog
            emiData={row.original}
            emiId={row.original.id}
            trigger={<RowActionTrigger icon={SquareSlash} label="Splits" />}
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
