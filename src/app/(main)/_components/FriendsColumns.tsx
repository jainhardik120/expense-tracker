'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type FriendSummary } from '@/types';

import { UpdateFriendForm } from './FriendsForms';

export const createFriendsColumns = (onRefresh: () => void): ColumnDef<FriendSummary>[] => [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => row.original.friend.name,
  },
  {
    accessorKey: 'startingBalance',
    header: 'Starting Balance',
    cell: ({ row }) => row.original.startingBalance.toFixed(2),
  },
  {
    accessorKey: 'transactions',
    header: 'Transactions',
    cell: ({ row }) => row.original.friendTransactions.toFixed(2),
  },
  {
    accessorKey: 'paid',
    header: 'Paid',
    cell: ({ row }) => row.original.paidByFriend.toFixed(2),
  },
  {
    accessorKey: 'expenses',
    header: 'Expenses',
    cell: ({ row }) => row.original.splits.toFixed(2),
  },
  {
    accessorKey: 'currentBalance',
    header: 'Current Balance',
    cell: ({ row }) => row.original.finalBalance.toFixed(2),
  },
  {
    accessorKey: 'actions',
    header: '',
    cell: ({ row }) => {
      const mutation = api.friends.deleteFriend.useMutation();
      return (
        <div className="flex w-full justify-end">
          <div className="flex flex-row gap-2">
            <UpdateFriendForm
              friendId={row.original.friend.id}
              initialData={row.original.friend}
              refresh={onRefresh}
            />
            <DeleteConfirmationDialog
              mutation={mutation}
              mutationInput={{ id: row.original.friend.id }}
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
