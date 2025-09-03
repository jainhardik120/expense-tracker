'use client';

import { type ColumnDef } from '@tanstack/react-table';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type SelfTransferStatement, statementKindMap, type Statement } from '@/types';

import { UpdateSelfTransferStatementForm } from './SelfTransferStatementForms';
import { UpdateStatementForm } from './StatementForms';
import StatementSplits from './StatementSplits';

const isSelfTransfer = (
  statement: Statement | SelfTransferStatement,
): statement is SelfTransferStatement => {
  return 'fromAccountId' in statement;
};

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
    default:
      return null;
  }
};

const StatementActions = ({
  statement,
  onRefresh,
}: {
  statement: Statement;
  onRefresh: () => void;
}) => {
  const mutation = api.statements.deleteStatement.useMutation();
  const { id } = statement;
  return (
    <div className="grid w-[480px] grid-cols-3 gap-2">
      {statement.statementKind === 'expense' ? (
        <StatementSplits statementData={statement} statementId={id} />
      ) : (
        <span className="text-center">-</span>
      )}
      <UpdateStatementForm initialData={statement} refresh={onRefresh} statementId={id} />
      <DeleteConfirmationDialog mutation={mutation} mutationInput={{ id }} refresh={onRefresh}>
        <Button variant="outline">Delete</Button>
      </DeleteConfirmationDialog>
    </div>
  );
};

const SelfTransferStatementActions = ({
  statement,
  onRefresh,
}: {
  statement: SelfTransferStatement;
  onRefresh: () => void;
}) => {
  const mutation = api.statements.deleteSelfTransferStatement.useMutation();
  const { id } = statement;
  return (
    <div className="grid w-[480px] grid-cols-3 gap-2">
      <span className="text-center">-</span>
      <UpdateSelfTransferStatementForm
        initialData={statement}
        refresh={onRefresh}
        statementId={id}
      />
      <DeleteConfirmationDialog mutation={mutation} mutationInput={{ id }} refresh={onRefresh}>
        <Button variant="outline">Delete</Button>
      </DeleteConfirmationDialog>
    </div>
  );
};

export const createStatementColumns = (
  onRefreshStatements: () => void,
): ColumnDef<Statement | SelfTransferStatement>[] => [
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => {
      const date = row.original.createdAt;
      return new Date(date).toLocaleString();
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
    accessorKey: 'from',
    header: 'From',
    cell: ({ row }) => <>{getFromAccount(row.original) ?? '-'}</>,
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
              statement={row.original}
              onRefresh={onRefreshStatements}
            />
          ) : (
            <StatementActions statement={row.original} onRefresh={onRefreshStatements} />
          )}
        </div>
      );
    },
  },
];
