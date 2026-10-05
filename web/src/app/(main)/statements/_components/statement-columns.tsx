'use client';

import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ZonedDate } from '@/components/zoned-date';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { cn } from '@/lib/utils';
import { getFromAccount, getToAccount } from '@/server/helpers/account';
import type { FacetCount } from '@/server/helpers/statement';
import {
  type SelfTransferStatement,
  statementKindMap,
  type Statement,
  type Account,
  type Friend,
  isSharedStatement,
  isSelfTransfer,
} from '@/types';

import {
  AmountEditor,
  EditableCell,
  ReorderHandle,
  SelectEditor,
  TagsEditor,
} from './editable-cells';
import {
  hasSignedAmount,
  signedAmountClassName,
  statementKindClassName,
} from './statement-appearance';
import { SelfTransferStatementActions, StatementActions } from './statement-row-actions';

type FacetCounts = Record<'account' | 'category' | 'tags' | 'statementKind', FacetCount[]>;

type FilterOption = { label: string; value: string; count: number };

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
  anchorRow,
  setAnchorRow,
}: {
  onRefreshStatements: () => void;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  tags: string[];
  facetCounts: FacetCounts;
  activeFilters: { category: string[]; tags: string[] };
  mode: 'view' | 'edit';
  onCellSave: (statement: Statement, patch: Partial<Statement>) => void;
  anchorRow: number | null;
  setAnchorRow: (index: number | null) => void;
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
    cell: ({ row, table }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        className="translate-y-0.5"
        onCheckedChange={(value) => {
          row.toggleSelected(value === true);
        }}
        onClick={(event) => {
          const anchor = anchorRow;
          if (event.shiftKey && anchor !== null && anchor !== row.index) {
            event.preventDefault();
            const select = !row.getIsSelected();
            const { rows } = table.getRowModel();
            const from = Math.min(anchor, row.index);
            const to = Math.max(anchor, row.index);
            const selection = { ...table.atoms.rowSelection.get() };
            for (let index = from; index <= to; index++) {
              const id = rows.at(index)?.id;
              if (id === undefined) {
                continue;
              }
              if (select) {
                selection[id] = true;
              } else {
                delete selection[id];
              }
            }
            table.setRowSelection(selection);
          }
          setAnchorRow(row.index);
        }}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { selectable: false },
    size: 40,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => {
      const date = row.original.createdAt;
      return <ZonedDate pattern={DATE_FORMAT.dateTime} value={date} />;
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
    enableSorting: false,
    cell: ({ row }) => (
      <span className={cn('font-medium', statementKindClassName(row.original))}>
        {isSelfTransfer(row.original)
          ? 'Self Transfer'
          : statementKindMap[row.original.statementKind]}
        {isSharedStatement(row.original) ? (
          <Badge
            className="ml-2"
            title={`Recorded by ${row.original.friendName ?? 'a friend'}`}
            variant="outline"
          >
            Shared
          </Badge>
        ) : null}
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
          {formatCurrency(amount)}
        </span>
      );
      if (isSelfTransfer(statement) || isSharedStatement(statement)) {
        return display;
      }
      return (
        <EditableCell columnId="amount" display={display} mode={mode} rowIndex={row.index}>
          {({ stop, seed }) => (
            <AmountEditor
              seed={seed}
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
        <EditableCell
          columnId="category"
          display={statement.category}
          mode={mode}
          rowIndex={row.index}
        >
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
      return (
        <span
          className={cn(
            'tabular-nums',
            splitAmount === 0 ? 'text-muted-foreground' : 'font-medium',
          )}
        >
          {formatCurrency(parseFloat(row.original.amount) - splitAmount)}
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
          accessorFn: (row) => formatCurrency(row.finalBalance ?? 0),
          header: startingBalance.name,
          enableSorting: false,
          cell: ({ row }) => (
            <span className="tabular-nums">{formatCurrency(row.original.finalBalance ?? 0)}</span>
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
      selectable: false,
    },
    enableHiding: false,
  },
  {
    id: 'drag-handle',
    header: '',
    meta: { selectable: false },
    cell: ({ row }) => (isSharedStatement(row.original) ? null : <ReorderHandle />),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
];
