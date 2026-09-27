'use client';

import Link from 'next/link';

import { type ColumnDef } from '@tanstack/react-table';
import { Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Button } from '@/components/ui/button';
import { formatOrdinalDay } from '@/lib/format';
import { api } from '@/server/react';
import { type FriendSummary, type AccountSummary, isFriendSummary } from '@/types';

import { UpdateAccountForm } from './account-forms';
import { CreditCardDialog } from './credit-card-dialog';
import { UpdateFriendForm } from './friend-forms';

type CreditCardAccount = {
  creditCardId?: string;
  creditAccountId?: string;
  cardLimit?: string;
  billingDate?: number;
};

const DeleteButton = ({
  mutation,
  id,
  onRefresh,
}: {
  mutation: ReturnType<typeof api.accounts.deleteAccount.useMutation>;
  id: string;
  onRefresh: () => void;
}) => (
  <DeleteConfirmationDialog mutation={mutation} mutationInput={{ id }} refresh={onRefresh}>
    <Button className="size-8" size="icon" variant="ghost">
      <Trash />
    </Button>
  </DeleteConfirmationDialog>
);

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
                  billingDate: row.billingDate ?? 1,
                }
              : null
          }
        />
        <UpdateAccountForm
          accountId={row.account.id}
          initialData={row.account}
          refresh={onRefresh}
        />
        <DeleteButton id={row.account.id} mutation={mutation} onRefresh={onRefresh} />
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
        <DeleteButton id={row.friend.id} mutation={mutation} onRefresh={onRefresh} />
      </div>
    </div>
  );
};

const StatementsLink = ({
  item,
}: {
  item: (AccountSummary & CreditCardAccount) | FriendSummary;
}) => {
  const isFriend = isFriendSummary(item);
  return (
    <Link
      className="hover:underline"
      href={`/statements?account=${isFriend ? item.friend.id : item.account.id}`}
    >
      {isFriend ? item.friend.name : item.account.accountName}
    </Link>
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
      // A real link, so the row is reachable by keyboard and opens in a new tab on
      // middle click -- the row-level handler only covers pointer clicks.
      cell: ({ row }) => <StatementsLink item={row.original} />,
    },
    {
      id: 'startingBalance',
      header: 'Starting Balance',
      accessorFn: (row) => row.startingBalance.toFixed(2),
    },
    {
      id: 'billingDate',
      header: 'Billing Date',
      accessorFn: (row) =>
        isFriendSummary(row) || row.billingDate === undefined
          ? '-'
          : formatOrdinalDay(row.billingDate),
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
