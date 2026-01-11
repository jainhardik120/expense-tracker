'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { GripVertical, Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SortableItemHandle } from '@/components/ui/sortable';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { getFromAccount, getToAccount } from '@/server/helpers/summary';
import { api } from '@/server/react';
import {
  type SelfTransferStatement,
  statementKindMap,
  type Statement,
  type Account,
  type Friend,
  isSelfTransfer,
  type CreditCardAccount,
} from '@/types';

import { LinkToEMIDialog } from './EMIForms';
import { UpdateSelfTransferStatementForm } from './SelfTransferStatementForms';
import { UpdateStatementForm } from './StatementForms';
import { StatementSplitsDialog } from './StatementSplits';

const StatementActions = ({
  statement,
  onRefresh,
  accountsData,
  friendsData,
  categories,
  creditAccounts,
}: {
  statement: Statement;
  onRefresh: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  creditAccounts: CreditCardAccount[];
}) => {
  const mutation = api.statements.deleteStatement.useMutation();
  const { id } = statement;
  const isCreditCardAccount =
    statement.accountId !== null &&
    creditAccounts.some((cc) => cc.accountId === statement.accountId);

  return (
    <div className="flex flex-row gap-2">
      {statement.statementKind === 'expense' && (
        <StatementSplitsDialog statementData={statement} statementId={id} />
      )}
      {isCreditCardAccount ? (
        <LinkToEMIDialog
          creditAccounts={creditAccounts}
          statement={statement}
          onRefresh={onRefresh}
        />
      ) : null}
      <UpdateStatementForm
        accountsData={accountsData}
        categories={categories}
        friendsData={friendsData}
        initialData={statement}
        refresh={onRefresh}
        statementId={id}
      />
      <DeleteConfirmationDialog mutation={mutation} mutationInput={{ id }} refresh={onRefresh}>
        <Button className="size-8" size="icon" variant="ghost">
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
        <Button className="size-8" size="icon" variant="ghost">
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

export const createStatementColumns = ({
  onRefreshStatements,
  accountsData,
  friendsData,
  categories,
  tags,
  creditAccounts,
  startingBalance,
}: {
  onRefreshStatements: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  tags: string[];
  creditAccounts: CreditCardAccount[];
  startingBalance?: {
    name: string;
    amount: number;
  };
}): ColumnDef<Statement | SelfTransferStatement>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        className="translate-y-0.5"
        onCheckedChange={(value) => {
          table.toggleAllPageRowsSelected(value === true);
        }}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        className="translate-y-0.5"
        onCheckedChange={(value) => {
          row.toggleSelected(value === true);
        }}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => {
      const date = row.original.createdAt;
      return <DateCell date={date} />;
    },
    id: 'date',
    meta: {
      label: 'Date',
      variant: 'dateRange',
    },
    enableColumnFilter: true,
  },
  {
    id: 'statementKind',
    accessorKey: 'statementKind',
    header: 'Statement Kind',
    cell: ({ row }) => (
      <>
        {isSelfTransfer(row.original)
          ? 'Self Transfer'
          : statementKindMap[row.original.statementKind]}
      </>
    ),
    meta: {
      label: 'Statement Kind',
      variant: 'multiSelect',
      options: Object.entries(statementKindMap).map(([key, value]) => ({
        label: value,
        value: key,
      })),
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => {
      const { amount } = row.original;
      return Number.parseFloat(amount).toFixed(2);
    },
    meta: {
      label: 'Amount',
    },
  },
  {
    id: 'category',
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }) => <>{isSelfTransfer(row.original) ? '-' : row.original.category}</>,
    meta: {
      label: 'Category',
      variant: 'multiSelect',
      options: categories.map((category) => ({ label: category, value: category })),
    },
    enableColumnFilter: true,
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
    meta: {
      label: 'To Account',
    },
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
    meta: {
      label: 'Expense',
    },
  },
  {
    id: 'finalBalance',
    accessorFn: (row) => (row.finalBalance ?? 0).toFixed(2),
    header: startingBalance?.name ?? '-',
    meta: {
      label: 'Final Balance',
    },
  },
  {
    id: 'tags',
    accessorKey: 'tags',
    header: 'Tags',
    cell: ({ row }) => (
      <>
        {isSelfTransfer(row.original) ? (
          '-'
        ) : (
          <div className="flex flex-wrap gap-2">
            {row.original.tags.map((item: string) => (
              <Badge key={item} className="max-w-[320px] px-2 py-1" variant="secondary">
                <span className="min-w-0 truncate">{item}</span>
              </Badge>
            ))}
          </div>
        )}
      </>
    ),
    meta: {
      label: 'Tags',
      variant: 'multiSelect',
      options: tags.map((tag) => ({ label: tag, value: tag })),
    },
    enableColumnFilter: true,
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
              categories={categories}
              creditAccounts={creditAccounts}
              friendsData={friendsData}
              statement={row.original}
              onRefresh={onRefreshStatements}
            />
          )}
        </div>
      );
    },
    meta: {
      label: 'Actions',
    },
    enableHiding: false,
  },
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
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
];
