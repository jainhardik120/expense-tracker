'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { GripVertical, Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SortableItemHandle } from '@/components/ui/sortable';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { cn } from '@/lib/utils';
import { getFromAccount, getToAccount } from '@/server/helpers/account';
import { api } from '@/server/react';
import {
  type SelfTransferStatement,
  statementKindMap,
  type Statement,
  type Account,
  type Friend,
  isSelfTransfer,
} from '@/types';

import { LinkToRecurringPaymentDialog } from './RecurringPaymentLink';
import { UpdateSelfTransferStatementForm } from './SelfTransferStatementForms';
import {
  hasSignedAmount,
  signedAmountClassName,
  statementKindClassName,
} from './statement-appearance';
import { UpdateStatementForm } from './StatementForms';
import { StatementSplitsDialog } from './StatementSplits';

const DeleteButton = ({
  mutation,
  id,
  onRefresh,
}: {
  mutation: ReturnType<typeof api.statements.deleteStatement.useMutation>;
  id: string;
  onRefresh: () => void;
}) => (
  <DeleteConfirmationDialog mutation={mutation} mutationInput={{ id }} refresh={onRefresh}>
    <Button className="size-8" size="icon" variant="ghost">
      <Trash />
    </Button>
  </DeleteConfirmationDialog>
);

const StatementActions = ({
  statement,
  onRefresh,
  accountsData,
  friendsData,
  categories,
}: {
  statement: Statement;
  onRefresh: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}) => {
  const mutation = api.statements.deleteStatement.useMutation();
  const { id } = statement;

  return (
    <div className="flex flex-row gap-2">
      {statement.statementKind === 'expense' && (
        <StatementSplitsDialog statementData={statement} statementId={id} />
      )}
      <LinkToRecurringPaymentDialog statement={statement} onRefresh={onRefresh} />
      <UpdateStatementForm
        accountsData={accountsData}
        categories={categories}
        friendsData={friendsData}
        initialData={statement}
        refresh={onRefresh}
        statementId={id}
      />
      <DeleteButton id={id} mutation={mutation} onRefresh={onRefresh} />
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
      <DeleteButton id={id} mutation={mutation} onRefresh={onRefresh} />
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

type FacetCount = { value: string; count: number };
type FacetCounts = Record<'account' | 'category' | 'tags' | 'statementKind', FacetCount[]>;

type FilterOption = { label: string; value: string; count: number };

/**
 * Filter options annotated with how many rows each value currently matches.
 *
 * Top-level filters keep every value and let the zeroes show: their value sets
 * are small, and a list that silently shrinks reads as broken. The ones below
 * them drop what no longer matches -- with a category chosen, the tags outside
 * it are noise rather than information, and there are hundreds of them.
 *
 * A value that is currently selected is always kept, whatever its count, so a
 * filter can still be seen and cleared after something above it narrowed it away.
 */
const withCounts = (
  options: { label: string; value: string }[],
  counts: FacetCount[],
  { cascade, selected = [] }: { cascade: boolean; selected?: string[] },
): FilterOption[] => {
  const byValue = new Map(counts.map((entry) => [entry.value, entry.count]));
  const selectedValues = new Set(selected);
  return options
    .map((option) => ({ ...option, count: byValue.get(option.value) ?? 0 }))
    .filter((option) => !cascade || option.count > 0 || selectedValues.has(option.value));
};

export const createStatementColumns = ({
  onRefreshStatements,
  accountsData,
  friendsData,
  categories,
  tags,
  facetCounts,
  activeFilters,
  startingBalance,
}: {
  onRefreshStatements: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  tags: string[];
  facetCounts: FacetCounts;
  activeFilters: { category: string[]; tags: string[] };
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
      <span className={cn('font-medium', statementKindClassName(row.original))}>
        {isSelfTransfer(row.original)
          ? 'Self Transfer'
          : statementKindMap[row.original.statementKind]}
      </span>
    ),
    meta: {
      label: 'Statement Kind',
      variant: 'multiSelect',
      options: withCounts(
        Object.entries(statementKindMap).map(([key, value]) => ({ label: value, value: key })),
        facetCounts.statementKind,
        { cascade: false },
      ),
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => {
      const amount = Number.parseFloat(row.original.amount);
      return (
        <span
          className={cn(
            'font-medium tabular-nums',
            hasSignedAmount(row.original) && signedAmountClassName(amount),
          )}
        >
          {amount.toFixed(2)}
        </span>
      );
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
      options: withCounts(
        categories.map((category) => ({ label: category, value: category })),
        facetCounts.category,
        { cascade: true, selected: activeFilters.category },
      ),
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
      options: withCounts(
        [
          ...accountsData.map((account) => ({ label: account.accountName, value: account.id })),
          ...friendsData.map((friend) => ({ label: friend.name, value: friend.id })),
        ],
        facetCounts.account,
        { cascade: false },
      ),
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
    cell: ({ row }) => {
      if (isSelfTransfer(row.original) || row.original.statementKind !== 'expense') {
        return <span className="text-muted-foreground">-</span>;
      }
      const { splitAmount } = row.original;
      // Without a split this just repeats the amount, so it stays quiet; once a
      // split makes the two differ, this is the number that is actually yours.
      return (
        <span
          className={cn(
            'tabular-nums',
            splitAmount === 0 ? 'text-muted-foreground' : 'font-medium',
          )}
        >
          {(parseFloat(row.original.amount) - splitAmount).toFixed(2)}
        </span>
      );
    },
    meta: {
      label: 'Expense',
    },
  },
  ...((startingBalance === undefined
    ? []
    : [
        {
          id: 'finalBalance',
          accessorFn: (row) => (row.finalBalance ?? 0).toFixed(2),
          header: startingBalance.name,
          cell: ({ row }) => (
            <span className="tabular-nums">{(row.original.finalBalance ?? 0).toFixed(2)}</span>
          ),
          meta: {
            label: 'Final Balance',
          },
        },
      ]) satisfies ColumnDef<Statement | SelfTransferStatement>[]),
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
      options: withCounts(
        tags.map((tag) => ({ label: tag, value: tag })),
        facetCounts.tags,
        { cascade: true, selected: activeFilters.tags },
      ),
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
