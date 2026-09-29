'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Link2, SquarePen, SquareSlash, Trash } from 'lucide-react';

import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { useTimezone } from '@/components/time-zone-setter';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { zonedFormat } from '@/lib/date';
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

import {
  AmountEditor,
  EditableCell,
  ReorderHandle,
  SelectEditor,
  TagsEditor,
} from './editable-cells';
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
    <RowActionTrigger destructive icon={Trash} label="Delete" />
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
    <RowActions>
      {statement.statementKind === 'expense' ? (
        <StatementSplitsDialog
          statementData={statement}
          statementId={id}
          trigger={<RowActionTrigger icon={SquareSlash} label="Splits" />}
        />
      ) : null}
      <LinkToRecurringPaymentDialog
        statement={statement}
        trigger={<RowActionTrigger icon={Link2} label="Links" />}
        onRefresh={onRefresh}
      />
      <UpdateStatementForm
        accountsData={accountsData}
        categories={categories}
        friendsData={friendsData}
        initialData={statement}
        refresh={onRefresh}
        statementId={id}
        trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
      />
      <DeleteButton id={id} mutation={mutation} onRefresh={onRefresh} />
    </RowActions>
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
    <RowActions>
      <UpdateSelfTransferStatementForm
        accountsData={accountsData}
        initialData={statement}
        refresh={onRefresh}
        statementId={id}
        trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
      />
      <DeleteButton id={id} mutation={mutation} onRefresh={onRefresh} />
    </RowActions>
  );
};

/**
 * Formatted on the server as well as the client, so the column arrives at its
 * final width.
 *
 * Rendering a placeholder until mount avoided a hydration mismatch -- the
 * server's clock is UTC and the reader's is not -- but at the cost of every row
 * resizing the moment the date appeared. The reader's zone is already in a
 * cookie, which both sides can read, so both sides can print the same string
 * the first time.
 */
const DateCell = ({ date }: { date: Date }) => {
  const timezone = useTimezone();
  return zonedFormat(date, "MMMM dd, yyyy 'at' hh:mm a", timezone);
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
  mode,
  onCellSave,
}: {
  onRefreshStatements: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  tags: string[];
  facetCounts: FacetCounts;
  activeFilters: { category: string[]; tags: string[] };
  /** Whether cells are being read or corrected. */
  mode: 'view' | 'edit';
  /** Save one corrected field of one statement. */
  onCellSave: (statement: Statement, patch: Partial<Statement>) => void;
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
    // The grid floors every column at 60px unless it says otherwise, which is
    // twenty more than a tick box needs and pushed every column after it out.
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
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
    enableSorting: true,
  },
  {
    id: 'statementKind',
    accessorKey: 'statementKind',
    header: 'Statement Kind',
    // Sorted by the server or not at all: it orders by date, amount and
    // category, so a heading offering to sort by anything else would be a
    // control that does nothing.
    enableSorting: false,
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
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
    enableSorting: true,
    cell: ({ row }) => {
      const statement = row.original;
      const amount = Number.parseFloat(statement.amount);
      const display = (
        <span
          className={cn(
            'font-medium tabular-nums',
            hasSignedAmount(statement) && signedAmountClassName(amount),
          )}
        >
          {amount.toFixed(2)}
        </span>
      );
      // A self transfer is two records with one endpoint each; correcting one
      // of them through this form would write half of it.
      if (isSelfTransfer(statement)) {
        return display;
      }
      return (
        <EditableCell columnId="amount" display={display} mode={mode} rowIndex={row.index}>
          {({ stop }) => (
            <AmountEditor
              stop={stop}
              value={statement.amount}
              onSave={(next) => {
                onCellSave(statement, { amount: next });
              }}
            />
          )}
        </EditableCell>
      );
    },
    meta: {
      align: 'right',
      label: 'Amount',
    },
  },
  {
    id: 'category',
    accessorKey: 'category',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
    enableSorting: true,
    cell: ({ row }) => {
      const statement = row.original;
      if (isSelfTransfer(statement)) {
        return <>-</>;
      }
      return (
        <EditableCell columnId="category" display={statement.category} mode={mode} rowIndex={row.index}>
          {({ stop }) => (
            <SelectEditor
              options={categories}
              stop={stop}
              value={statement.category}
              onSave={(next) => {
                onCellSave(statement, { category: next });
              }}
            />
          )}
        </EditableCell>
      );
    },
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
    enableSorting: false,
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
    enableSorting: false,
    cell: ({ row }) => <>{getToAccount(row.original) ?? '-'}</>,
    meta: {
      label: 'To Account',
    },
  },
  {
    accessorKey: 'expense',
    header: 'Expense',
    enableSorting: false,
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
      align: 'right',
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
          enableSorting: false,
          cell: ({ row }) => (
            <span className="tabular-nums">{(row.original.finalBalance ?? 0).toFixed(2)}</span>
          ),
          meta: {
            align: 'right',
            label: 'Final Balance',
          },
        },
      ]) satisfies ColumnDef<Statement | SelfTransferStatement>[]),
  {
    id: 'tags',
    accessorKey: 'tags',
    header: 'Tags',
    enableSorting: false,
    cell: ({ row }) => {
      const statement = row.original;
      if (isSelfTransfer(statement)) {
        return <>-</>;
      }
      const display = (
        <div className="flex flex-wrap gap-2">
          {statement.tags.map((item: string) => (
            <Badge key={item} className="max-w-[320px] px-2 py-1" variant="secondary">
              <span className="min-w-0 truncate">{item}</span>
            </Badge>
          ))}
        </div>
      );
      return (
        <EditableCell columnId="tags" display={display} mode={mode} rowIndex={row.index}>
          {({ stop }) => (
            <TagsEditor
              options={tags}
              stop={stop}
              value={statement.tags}
              onSave={(next) => {
                onCellSave(statement, { tags: next });
              }}
            />
          )}
        </EditableCell>
      );
    },
    meta: {
      label: 'Tags',
      variant: 'multiSelect',
      options: withCounts(
        tags.map((tag) => ({ label: tag, value: tag })),
        facetCounts.tags,
        { cascade: true, selected: activeFilters.tags },
      ),
      // Creatable, unlike the category: the tags are a vocabulary that grows,
      // and refusing a new one here would mean leaving the grid to add it.
      cell: {
        variant: 'multi-select',
        creatable: true,
        options: tags.map((tag) => ({ label: tag, value: tag })),
      },
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => {
      return (
        <>
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
        </>
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
    cell: () => <ReorderHandle />,
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
];
