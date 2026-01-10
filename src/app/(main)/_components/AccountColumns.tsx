'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type FriendSummary, type AccountSummary, isFriendSummary } from '@/types';

import { UpdateAccountForm } from './AccountForms';
import { CreditCardDialog } from './CreditCardDialog';
import { UpdateFriendForm } from './FriendsForms';

type CreditCardAccount = { creditCardId?: string; creditAccountId?: string; cardLimit?: string };

const AccountActions = ({
  row,
  onRefresh,
}: {
  row: AccountSummary & CreditCardAccount;
  onRefresh: () => void;
}) => {
  const mutation = api.accounts.deleteAccount.useMutation();
  const isExistingCreditCard = row.creditCardId !== undefined && row.creditCardId.length > 0;
  return (
    <div className="flex w-full justify-end">
      <div className="flex flex-row gap-2">
        <CreditCardDialog
          accountId={row.account.id}
          accountName={row.account.accountName}
          existingCreditCard={
            isExistingCreditCard
              ? {
                  id: row.creditCardId ?? '',
                  cardLimit: row.cardLimit ?? '',
                }
              : null
          }
        />
        <UpdateAccountForm
          accountId={row.account.id}
          initialData={row.account}
          refresh={onRefresh}
        />
        <DeleteConfirmationDialog
          mutation={mutation}
          mutationInput={{ id: row.account.id }}
          refresh={onRefresh}
        >
          <Button className="size-8" size="icon" variant="outline">
            <Trash />
          </Button>
        </DeleteConfirmationDialog>
      </div>
    </div>
  );
};

const FriendActions = ({ row, onRefresh }: { row: FriendSummary; onRefresh: () => void }) => {
  const mutation = api.friends.deleteFriend.useMutation();
  return (
    <div className="flex w-full justify-end">
      <div className="flex flex-row gap-2">
        <UpdateFriendForm friendId={row.friend.id} initialData={row.friend} refresh={onRefresh} />
        <DeleteConfirmationDialog
          mutation={mutation}
          mutationInput={{ id: row.friend.id }}
          refresh={onRefresh}
        >
          <Button className="size-8" size="icon" variant="outline">
            <Trash />
          </Button>
        </DeleteConfirmationDialog>
      </div>
    </div>
  );
};

export const createAccountColumns = (
  onRefresh: () => void,
): ColumnDef<(AccountSummary & CreditCardAccount) | FriendSummary>[] => {
  return [
    {
      id: 'name',
      header: 'Account Name',
      accessorFn: (row) => (isFriendSummary(row) ? row.friend.name : row.account.accountName),
    },
    {
      id: 'startingBalance',
      header: 'Starting Balance',
      accessorFn: (row) => row.startingBalance.toFixed(2),
    },
    {
      id: 'expenses',
      header: 'Expenses',
      accessorFn: (row) => (isFriendSummary(row) ? row.splits : row.expenses).toFixed(2),
    },
    {
      id: 'selfTransfers',
      header: 'Self Transfers',
      accessorFn: (row) => (isFriendSummary(row) ? '-' : row.selfTransfers.toFixed(2)),
    },
    {
      accessorKey: 'outsideTransactions',
      header: 'Other Transactions',
      accessorFn: (row) =>
        isFriendSummary(row)
          ? row.friendTransactions.toFixed(2)
          : row.outsideTransactions.toFixed(2),
    },
    {
      accessorKey: 'friendTransactions',
      header: 'Friend Transactions',
      accessorFn: (row) =>
        isFriendSummary(row) ? row.paidByFriend.toFixed(2) : row.friendTransactions.toFixed(2),
    },
    {
      accessorKey: 'date',
      header: 'Current Balance',
      cell: ({ row }) => row.original.finalBalance.toFixed(2),
    },
    {
      accessorKey: 'actions',
      header: '',
      cell: ({ row }) => {
        return (
          <>
            {isFriendSummary(row.original) ? (
              <FriendActions row={row.original} onRefresh={onRefresh} />
            ) : (
              <AccountActions row={row.original} onRefresh={onRefresh} />
            )}
          </>
        );
      },
    },
  ];
};
