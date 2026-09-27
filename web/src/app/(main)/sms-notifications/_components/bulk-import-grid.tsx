'use client';

import { useCallback, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { type ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { DataGrid } from '@/components/data-grid/data-grid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useDataGrid } from '@/hooks/use-data-grid';
import { formatCurrency } from '@/lib/format';
import {
  type BulkImportRow,
  getBulkImportReadiness,
  getRowProblem,
  statementKindOptions,
} from '@/lib/sms-bulk-import';
import { api } from '@/server/react';
import type { Account, Friend } from '@/types';

const GRID_HEIGHT = 620;

// The grid keeps two column ids out of keyboard navigation and paste targeting,
// `select` and `actions`, and styles them without cell borders. The tick box and
// the status column are exactly those two things, so they take those ids: arrow
// keys then run along the editable columns only, and a pasted block cannot land
// in either of them.
const SELECT_COLUMN_ID = 'select';
const STATUS_COLUMN_ID = 'actions';

const COLUMN_SIZE = {
  include: 44,
  merchant: 190,
  bank: 140,
  date: 130,
  amount: 120,
  kind: 170,
  account: 180,
  friend: 160,
  category: 170,
  tags: 200,
  problem: 250,
};

const toOptions = (values: string[]) => values.map((value) => ({ label: value, value }));

/**
 * A column the user reads but does not edit.
 *
 * The grid gives a column its editable cell variant unless the header is a
 * function, in which case it renders the column's own `cell` instead. That is
 * the only way to show the message's own details — which are not statement
 * fields and are written nowhere — without inviting edits to them.
 */
const readOnlyColumn = (
  id: string,
  label: string,
  size: number,
  render: (row: BulkImportRow) => React.ReactNode,
): ColumnDef<BulkImportRow> => ({
  id,
  size,
  enableSorting: false,
  header: () => <span className="text-muted-foreground text-xs font-medium">{label}</span>,
  cell: ({ row }) => render(row.original),
});

const RowStatusCell = ({ row }: { row: BulkImportRow }) => {
  const problem = getRowProblem(row);
  if (problem !== null) {
    return (
      <span className="text-destructive flex items-center gap-1.5 text-xs" title={problem}>
        <AlertCircle className="size-3.5 shrink-0" />
        <span className="truncate">{problem}</span>
      </span>
    );
  }
  if (!row.include) {
    return <span className="text-muted-foreground text-xs">Skipped</span>;
  }
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Check className="size-3.5 shrink-0" />
      Ready
    </span>
  );
};

const createBulkImportColumns = ({
  accounts,
  friends,
  categories,
  tags,
  onIncludeChange,
}: {
  accounts: Account[];
  friends: Friend[];
  categories: string[];
  tags: string[];
  onIncludeChange: (id: string, include: boolean) => void;
}): ColumnDef<BulkImportRow>[] => [
  {
    id: SELECT_COLUMN_ID,
    size: COLUMN_SIZE.include,
    enableSorting: false,
    header: () => <span className="sr-only">Import</span>,
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Import ${row.original.merchant === '' ? row.original.bankName : row.original.merchant}`}
        checked={row.original.include}
        onCheckedChange={(checked) => {
          onIncludeChange(row.original.id, checked === true);
        }}
      />
    ),
  },
  readOnlyColumn('merchant', 'Merchant', COLUMN_SIZE.merchant, (row) => (
    <span className="truncate text-sm" title={row.merchant}>
      {row.merchant === '' ? '—' : row.merchant}
    </span>
  )),
  readOnlyColumn('bankName', 'Bank', COLUMN_SIZE.bank, (row) => (
    <span className="text-muted-foreground truncate text-sm">
      {row.bankName}
      {row.accountLast4 === '' ? '' : ` ····${row.accountLast4}`}
    </span>
  )),
  {
    id: 'date',
    accessorKey: 'date',
    size: COLUMN_SIZE.date,
    meta: { label: 'Date', cell: { variant: 'date' } },
  },
  {
    id: 'amount',
    accessorKey: 'amount',
    size: COLUMN_SIZE.amount,
    meta: { label: 'Amount', cell: { variant: 'number' } },
  },
  {
    id: 'statementKind',
    accessorKey: 'statementKind',
    size: COLUMN_SIZE.kind,
    meta: { label: 'Kind', cell: { variant: 'select', options: statementKindOptions } },
  },
  {
    id: 'accountId',
    accessorKey: 'accountId',
    size: COLUMN_SIZE.account,
    meta: {
      label: 'Account',
      cell: {
        variant: 'select',
        options: accounts.map((account) => ({ label: account.accountName, value: account.id })),
      },
    },
  },
  {
    id: 'friendId',
    accessorKey: 'friendId',
    size: COLUMN_SIZE.friend,
    meta: {
      label: 'Friend',
      cell: {
        variant: 'select',
        options: friends.map((friend) => ({ label: friend.name, value: friend.id })),
      },
    },
  },
  {
    id: 'category',
    accessorKey: 'category',
    size: COLUMN_SIZE.category,
    meta: { label: 'Category', cell: { variant: 'select', options: toOptions(categories) } },
  },
  {
    id: 'tags',
    accessorKey: 'tags',
    size: COLUMN_SIZE.tags,
    meta: { label: 'Tags', cell: { variant: 'multi-select', options: toOptions(tags) } },
  },
  readOnlyColumn(STATUS_COLUMN_ID, '', COLUMN_SIZE.problem, (row) => (
    <RowStatusCell row={row} />
  )),
];

type BulkImportGridProps = Readonly<{
  initialRows: BulkImportRow[];
  accounts: Account[];
  friends: Friend[];
  categories: string[];
  tags: string[];
}>;

/**
 * The pending queue as a spreadsheet.
 *
 * State starts from what the server sent and stays local from then on, so a
 * long session of corrections is never interrupted by a refetch. The parent
 * keys this component on the queue it fetched, which is what resets the grid
 * once an import has actually changed what is pending.
 */
export const BulkImportGrid = ({
  initialRows,
  accounts,
  friends,
  categories,
  tags,
}: BulkImportGridProps) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const mutation = api.smsNotifications.bulkImport.useMutation();

  const onIncludeChange = useCallback((id: string, include: boolean) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, include } : row)),
    );
  }, []);

  const columns = useMemo(
    () => createBulkImportColumns({ accounts, friends, categories, tags, onIncludeChange }),
    [accounts, friends, categories, tags, onIncludeChange],
  );

  const dataGrid = useDataGrid({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    onDataChange: setRows,
    enableSearch: true,
    enablePaste: true,
  });

  const readiness = useMemo(() => getBulkImportReadiness(rows), [rows]);

  // What the selected rows do to the balance overall: an expense leaves, and
  // everything else keeps the sign it was given.
  const net = useMemo(
    () =>
      readiness.included.reduce(
        (total, row) => total + (row.statementKind === 'expense' ? -row.amount : row.amount),
        0,
      ),
    [readiness.included],
  );

  const onImport = async () => {
    try {
      const result = await mutation.mutateAsync({
        rows: readiness.included.map((row) => ({
          id: row.id,
          date: row.date,
          amount: row.amount,
          statementKind: row.statementKind,
          accountId: row.accountId,
          friendId: row.friendId,
          category: row.category,
          tags: row.tags,
        })),
      });
      const staleNote =
        result.stale > 0 ? ` ${result.stale} were no longer pending and were left alone.` : '';
      toast.success(`Imported ${result.imported} transaction(s).${staleNote}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    }
  };

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border p-8 text-center text-sm">
        Nothing is waiting to be entered.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DataGrid {...dataGrid} height={GRID_HEIGHT} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{readiness.included.length} selected</Badge>
          {readiness.skipped > 0 ? (
            <Badge variant="outline">{readiness.skipped} skipped</Badge>
          ) : null}
          {readiness.problems.length > 0 ? (
            <Badge variant="destructive">
              {readiness.problems.length} need{readiness.problems.length === 1 ? 's' : ''} attention
            </Badge>
          ) : null}
          <span className="text-muted-foreground">
            Net {formatCurrency(net, rows[0].currency)}
          </span>
        </div>
        <Button disabled={!readiness.canImport || mutation.isPending} onClick={onImport}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Import {readiness.included.length} transaction
          {readiness.included.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
};
