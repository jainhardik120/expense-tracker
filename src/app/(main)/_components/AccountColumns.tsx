'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Trash } from 'lucide-react';

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
      cell: ({ row }) => row.original.startingBalance.toFixed(2),
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
      cell: ({ row }) => row.original.finalBalance.toFixed(2),
    },
    {
      accessorKey: 'actions',
      header: '',
      cell: ({ row }) => {
        const mutation = api.accounts.deleteAccount.useMutation();
        return (
          <div className="flex w-full justify-end">
            <div className="flex flex-row gap-2">
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
                <Button className="size-8" size="icon" variant="outline">
                  <Trash />
                </Button>
              </DeleteConfirmationDialog>
            </div>
          </div>
        );
      },
    },
  ];
};
