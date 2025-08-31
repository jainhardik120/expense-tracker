'use client';

import { type ColumnDef } from '@tanstack/react-table';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type AccountSummary } from '@/types';

import { UpdateAccountForm } from './AccountForms';

export const createAccountColumns = (onRefresh: () => void): ColumnDef<AccountSummary>[] => {
  return [
    {
      accessorKey: 'accountName',
      header: 'Account Name',
      cell: ({ row }) => row.original.account.accountName,
    },
    {
      accessorKey: 'startingBalance',
      header: 'Starting Balance',
      cell: ({ row }) => parseFloat(row.original.account.startingBalance).toFixed(2),
    },
    {
      accessorKey: 'expenses',
      header: 'Expenses',
      cell: ({ row }) => row.original.expenses.toFixed(2),
    },
    {
      accessorKey: 'selfTransfers',
      header: 'Self Transfers',
      cell: ({ row }) => row.original.selfTransfers.toFixed(2),
    },
    {
      accessorKey: 'outsideTransactions',
      header: 'Outside Transactions',
      cell: ({ row }) => row.original.outsideTransactions.toFixed(2),
    },
    {
      accessorKey: 'friendTransactions',
      header: 'Friend Transactions',
      cell: ({ row }) => row.original.friendTransactions.toFixed(2),
    },

    {
      accessorKey: 'finalAmount',
      header: 'Current Balance',
      cell: ({ row }) => row.original.finalAmount.toFixed(2),
    },
    {
      accessorKey: 'actions',
      header: '',
      cell: ({ row }) => {
        const mutation = api.accounts.deleteAccount.useMutation();
        return (
          <div className="flex w-full justify-end">
            <div className="grid w-[320px] grid-cols-2 gap-2">
              <UpdateAccountForm
                accountId={row.original.account.id}
                initialData={row.original.account}
                refresh={onRefresh}
              />
              <DeleteConfirmationDialog
                mutation={mutation}
                mutationInput={{ id: row.original.account.id }}
                refresh={onRefresh}
              >
                <Button variant="outline">Delete</Button>
              </DeleteConfirmationDialog>
            </div>
          </div>
        );
      },
    },
  ];
};
