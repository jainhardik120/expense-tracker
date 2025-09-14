'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { GripVertical, Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SortableItemHandle } from '@/components/ui/sortable';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { api } from '@/server/react';
import {
  type SelfTransferStatement,
  statementKindMap,
  type Statement,
  type Account,
  type Friend,
  isSelfTransfer,
} from '@/types';

import { UpdateSelfTransferStatementForm } from './SelfTransferStatementForms';
import { UpdateStatementForm } from './StatementForms';
import StatementSplits from './StatementSplits';

const getFromAccount = (statement: Statement | SelfTransferStatement): string | null => {
  if (isSelfTransfer(statement)) {
    return statement.fromAccount;
  }
  switch (statement.statementKind) {
    case 'expense':
      return statement.accountName ?? statement.friendName;
    case 'friend_transaction':
      return parseFloat(statement.amount) < 0 ? statement.accountName : statement.friendName;
    case 'outside_transaction':
      return parseFloat(statement.amount) < 0 ? statement.accountName : null;
    case 'self_transfer':
      return null;
    default:
      return null;
  }
};

const getToAccount = (statement: Statement | SelfTransferStatement): string | null => {
  if (isSelfTransfer(statement)) {
    return statement.toAccount;
  }
  switch (statement.statementKind) {
    case 'expense':
      return null;
    case 'friend_transaction':
      return parseFloat(statement.amount) < 0 ? statement.friendName : statement.accountName;
    case 'outside_transaction':
      return parseFloat(statement.amount) < 0 ? null : statement.accountName;
    case 'self_transfer':
      return null;
    default:
      return null;
  }
};

const StatementActions = ({
  statement,
  onRefresh,
  accountsData,
  friendsData,
}: {
  statement: Statement;
  onRefresh: () => void;
  accountsData: Account[];
  friendsData: Friend[];
}) => {
  const mutation = api.statements.deleteStatement.useMutation();
  const { id } = statement;
  return (
    <div className="flex flex-row gap-2">
      {statement.statementKind === 'expense' && (
        <StatementSplits statementData={statement} statementId={id} />
      )}
      <UpdateStatementForm
        accountsData={accountsData}
        friendsData={friendsData}
        initialData={statement}
        refresh={onRefresh}
        statementId={id}
      />
      <DeleteConfirmationDialog mutation={mutation} mutationInput={{ id }} refresh={onRefresh}>
        <Button className="size-8" size="icon" variant="outline">
          <Trash />
        </Button>
      </DeleteConfirmationDialog>
    </div>
  );
};

const SelfTransferStatementActions = ({
  statement,
  onRefresh,
  accountsData,
}: {
  statement: SelfTransferStatement;
  onRefresh: () => void;
  accountsData: Account[];
}) => {
  const mutation = api.statements.deleteSelfTransferStatement.useMutation();
  const { id } = statement;
  return (
    <div className="flex flex-row gap-2">
      <UpdateSelfTransferStatementForm
        accountsData={accountsData}
        initialData={statement}
        refresh={onRefresh}
        statementId={id}
      />
      <DeleteConfirmationDialog mutation={mutation} mutationInput={{ id }} refresh={onRefresh}>
        <Button className="size-8" size="icon" variant="outline">
          <Trash />
        </Button>
      </DeleteConfirmationDialog>
    </div>
  );
};

const DateCell = ({ date }: { date: Date }) => {
  const isMounted = useIsMounted();

  return isMounted
    ? new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';
};

export const createStatementColumns = (
  onRefreshStatements: () => void,
  accountsData: Account[],
  friendsData: Friend[],
  startingBalance?: {
    name: string;
    amount: number;
  },
): ColumnDef<Statement | SelfTransferStatement>[] => [
  {
    id: 'drag-handle',
    header: '',
    cell: () => {
      return (
        <SortableItemHandle asChild>
          <Button className="size-8" size="icon" variant="ghost">
            <GripVertical className="h-4 w-4" />
          </Button>
        </SortableItemHandle>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => {
      const date = row.original.createdAt;
      return <DateCell date={date} />;
    },
  },
  {
    accessorKey: 'statementKind',
    header: 'Statement Kind',
    cell: ({ row }) => (
      <>
        {isSelfTransfer(row.original)
          ? 'Self Transfer'
          : statementKindMap[row.original.statementKind]}
      </>
    ),
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => {
      const { amount } = row.original;
      return parseFloat(amount).toFixed(2);
    },
  },
  {
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }) => <>{isSelfTransfer(row.original) ? '-' : row.original.category}</>,
  },
  {
    id: 'account',
    accessorKey: 'from',
    header: 'From',
    cell: ({ row }) => <>{getFromAccount(row.original) ?? '-'}</>,
    meta: {
      label: 'Account',
      variant: 'multiSelect',
      options: [
        ...accountsData.map((account) => ({ label: account.accountName, value: account.id })),
        ...friendsData.map((friend) => ({ label: friend.name, value: friend.id })),
      ],
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'to',
    header: 'To',
    cell: ({ row }) => <>{getToAccount(row.original) ?? '-'}</>,
  },
  {
    accessorKey: 'expense',
    header: 'Expense',
    cell: ({ row }) => (
      <>
        {!isSelfTransfer(row.original) && row.original.statementKind === 'expense'
          ? (parseFloat(row.original.amount) - row.original.splitAmount).toFixed(2)
          : '-'}
      </>
    ),
  },
  {
    id: 'finalBalance',
    accessorFn: (row) => (row.finalBalance ?? 0).toFixed(2),
    header: startingBalance?.name ?? '-',
  },
  {
    accessorKey: 'tags',
    header: 'Tags',
    cell: ({ row }) => (
      <>
        {isSelfTransfer(row.original) ? (
          '-'
        ) : (
          <div className="flex flex-wrap gap-2">
            {row.original.tags.map((item: string) => (
              <Badge key={item} className="px-2 py-1" variant="secondary">
                {item}
              </Badge>
            ))}
          </div>
        )}
      </>
    ),
  },
  {
    accessorKey: 'actions',
    header: '',
    cell: ({ row }) => {
      return (
        <div className="flex w-full justify-end">
          {isSelfTransfer(row.original) ? (
            <SelfTransferStatementActions
              accountsData={accountsData}
              statement={row.original}
              onRefresh={onRefreshStatements}
            />
          ) : (
            <StatementActions
              accountsData={accountsData}
              friendsData={friendsData}
              statement={row.original}
              onRefresh={onRefreshStatements}
            />
          )}
        </div>
      );
    },
  },
];
