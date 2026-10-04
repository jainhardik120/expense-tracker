'use client';

import Link from 'next/link';

import { type ColumnDef } from '@tanstack/react-table';
import { CreditCard, SquarePen, Trash } from 'lucide-react';

import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { formatOrdinalDay, formatCurrency } from '@/lib/format';
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
    <RowActionTrigger destructive icon={Trash} label="Delete" />
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
    <RowActions>
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
        trigger={
          <RowActionTrigger
            icon={CreditCard}
            label={isExistingCreditCard ? 'Card settings' : 'Make a credit card'}
          />
        }
      />
      <UpdateAccountForm
        accountId={row.account.id}
        initialData={row.account}
        refresh={onRefresh}
        trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
      />
      <DeleteButton id={row.account.id} mutation={mutation} onRefresh={onRefresh} />
    </RowActions>
  );
};

const FriendActions = ({ row, onRefresh }: { row: FriendSummary; onRefresh: () => void }) => {
  const mutation = api.friends.deleteFriend.useMutation();
  return (
    <RowActions>
      <UpdateFriendForm
        friendId={row.friend.id}
        initialData={row.friend}
        refresh={onRefresh}
        trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
      />
      <DeleteButton id={row.friend.id} mutation={mutation} onRefresh={onRefresh} />
    </RowActions>
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
      prefetch={false}
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
      cell: ({ row }) => <StatementsLink item={row.original} />,
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
      id: 'startingBalance',
      header: 'Starting Balance',
      accessorFn: (row) => formatCurrency(row.startingBalance),
      meta: { align: 'right' },
    },
    {
      id: 'expenses',
      header: 'Expenses',
      accessorFn: (row) => formatCurrency(isFriendSummary(row) ? row.splits : row.expenses),
      meta: { align: 'right' },
    },
    {
      id: 'selfTransfers',
      header: 'Self Transfers',
      accessorFn: (row) => (isFriendSummary(row) ? '-' : formatCurrency(row.selfTransfers)),
      meta: { align: 'right' },
    },
    {
      accessorKey: 'outsideTransactions',
      header: 'Other Transactions',
      accessorFn: (row) =>
        isFriendSummary(row)
          ? formatCurrency(row.friendTransactions)
          : formatCurrency(row.outsideTransactions),
      meta: { align: 'right' },
    },
    {
      accessorKey: 'friendTransactions',
      header: 'Friend Transactions',
      accessorFn: (row) =>
        isFriendSummary(row)
          ? formatCurrency(row.paidByFriend)
          : formatCurrency(row.friendTransactions),
      meta: { align: 'right' },
    },
    {
      accessorKey: 'date',
      header: 'Current Balance',
      cell: ({ row }) => formatCurrency(row.original.finalBalance),
      meta: { align: 'right' },
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
