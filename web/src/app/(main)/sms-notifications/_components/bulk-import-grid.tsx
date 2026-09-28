'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { type ColumnDef, type Row, type Table } from '@tanstack/react-table';
import { AlertCircle, Check, EyeOff, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { EditableTable } from '@/components/editable-table/editable-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useEditableTable } from '@/hooks/use-editable-table';
import { formatCurrency } from '@/lib/format';
import {
  addTagToRows,
  type BulkImportRow,
  collectTagOptions,
  getBulkImportReadiness,
  getRowProblem,
  statementKindOptions,
  updateRows,
} from '@/lib/sms-bulk-import';
import { api } from '@/server/react';
import type { Account, Friend } from '@/types';
import type { CellOpts } from '@/types/data-grid';

import { BulkImportActionBar } from './bulk-import-action-bar';
import { SMS_COLUMN_SIZE } from './column-sizes';

const GRID_HEIGHT = 620;

// The grid keeps two column ids out of keyboard navigation and paste targeting,
// `select` and `actions`, and styles them without cell borders. The row tick box
// and the status column are exactly those two things, so they take those ids:
// arrow keys then run along the editable columns only, and a pasted block cannot
// land in either of them.
const SELECT_COLUMN_ID = 'select';
const STATUS_COLUMN_ID = 'actions';

// Eleven columns, and they have to add up to less than the window or the ones on
// the end need scrolling to reach. Pinning the end column instead is worse: a
// sticky column sits on top of whatever scrolls under it, which at this width was
// the tag column. So these are sized to fit, and the status text truncates with
// the full reason on hover.

const toOptions = (values: string[]) => values.map((value) => ({ label: value, value }));

/**
 * An editable column.
 *
 * The `header` has to be a string, and that is the whole reason this helper
 * exists. The grid decides whether a cell is editable by asking whether the
 * column's header is a function: a function means "this column renders itself",
 * and the cell is handed to `columnDef.cell` instead of the editing variant.
 *
 * TanStack fills in a *function* header for any column that omits one — it
 * returns the accessor key — so leaving `header` off does not leave the column
 * headerless, it quietly makes the column read-only and renders the raw stored
 * value. For a select that is the option's id rather than its label.
 */
const editableColumn = (
  id: keyof BulkImportRow,
  label: string,
  size: number,
  cell: CellOpts,
): ColumnDef<BulkImportRow> => ({
  id,
  accessorKey: id,
  size,
  header: label,
  meta: { label, cell },
});

/**
 * A column the user reads but does not edit — the other side of the same rule.
 * A function header keeps the cell out of the editing variants, which is what
 * the message's own details want: they are not statement fields and are written
 * nowhere, so they should not look editable.
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

/**
 * The row's tick box, which selects it for the action bar and nothing else.
 *
 * Whether a row gets imported is a separate, lasting choice and lives in the
 * status column — this selection is dropped by the grid the moment a cell is
 * clicked, so it could not safely stand for "import this".
 */
const SelectRowCell = ({
  row,
  table,
}: {
  row: Row<BulkImportRow>;
  table: Table<BulkImportRow>;
}) => {
  const shiftHeld = useRef(false);
  const { meta } = table.options;
  return (
    <Checkbox
      aria-label={`Select ${row.original.merchant === '' ? row.original.bankName : row.original.merchant}`}
      checked={row.getIsSelected()}
      onCheckedChange={(checked) => {
        // Shift extends from the last row ticked, so a run of similar messages
        // takes two clicks rather than seven.
        //
        // The position in the current row model, not `row.index` (which ignores
        // sorting) and not the grid's `getVisualRowIndex` (which is 1-based, for
        // the aria-rowindex attribute, and would select the row below the one
        // ticked).
        const index = table.getRowModel().rows.indexOf(row);
        meta?.onRowSelect?.(index, checked === true, shiftHeld.current);
      }}
      onPointerDown={(event) => {
        shiftHeld.current = event.shiftKey;
      }}
    />
  );
};

const RowStatus = ({ row }: { row: BulkImportRow }) => {
  const problem = getRowProblem(row);
  if (problem !== null) {
    return (
      <span className="text-destructive flex min-w-0 items-center gap-1.5 text-xs" title={problem}>
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

const RowStatusCell = ({
  row,
  onIncludeChange,
}: {
  row: BulkImportRow;
  onIncludeChange: (id: string, include: boolean) => void;
}) => (
  <div className="flex w-full items-center justify-between gap-2">
    <RowStatus row={row} />
    <Button
      className="text-muted-foreground size-6 shrink-0"
      size="icon"
      title={row.include ? 'Leave this out of the import' : 'Put this back in the import'}
      variant="ghost"
      onClick={() => {
        onIncludeChange(row.id, !row.include);
      }}
    >
      {row.include ? <EyeOff className="size-3.5" /> : <RotateCcw className="size-3.5" />}
    </Button>
  </div>
);

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
    size: SMS_COLUMN_SIZE.gutter,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select every row"
        checked={
          table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() ? 'indeterminate' : false)
        }
        onCheckedChange={(checked) => {
          table.toggleAllRowsSelected(checked === true);
        }}
      />
    ),
    cell: ({ row, table }) => <SelectRowCell row={row} table={table} />,
  },
  // Date, Amount, Merchant and Bank first, and in that order, because that is
  // where the table puts them. The columns a message is *entered* with follow,
  // so switching into editing reads as new columns arriving on the right rather
  // than as a different table.
  editableColumn('date', 'Date', SMS_COLUMN_SIZE.date, { variant: 'date' }),
  editableColumn('amount', 'Amount', SMS_COLUMN_SIZE.amount, { variant: 'number' }),
  readOnlyColumn('merchant', 'Merchant', SMS_COLUMN_SIZE.merchant, (row) => (
    <span className="truncate text-sm" title={row.merchant}>
      {row.merchant === '' ? '—' : row.merchant}
    </span>
  )),
  readOnlyColumn('bankName', 'Bank', SMS_COLUMN_SIZE.bank, (row) => (
    <span className="text-muted-foreground truncate text-sm">
      {row.bankName}
      {row.accountLast4 === '' ? '' : ` ····${row.accountLast4}`}
    </span>
  )),
  editableColumn('statementKind', 'Kind', SMS_COLUMN_SIZE.kind, {
    variant: 'select',
    options: statementKindOptions,
  }),
  editableColumn('accountId', 'Account', SMS_COLUMN_SIZE.accountPicker, {
    variant: 'select',
    options: accounts.map((account) => ({ label: account.accountName, value: account.id })),
  }),
  editableColumn('friendId', 'Friend', SMS_COLUMN_SIZE.friend, {
    variant: 'select',
    options: friends.map((friend) => ({ label: friend.name, value: friend.id })),
  }),
  editableColumn('category', 'Category', SMS_COLUMN_SIZE.category, {
    variant: 'select',
    options: toOptions(categories),
  }),
  editableColumn('tags', 'Tags', SMS_COLUMN_SIZE.tags, {
    variant: 'multi-select',
    options: toOptions(tags),
    // A tag the user has not used before is a normal thing to want; the vocabulary
    // is their own history, not a fixed list.
    creatable: true,
  }),
  readOnlyColumn(STATUS_COLUMN_ID, '', SMS_COLUMN_SIZE.rowStatus, (row) => (
    <RowStatusCell row={row} onIncludeChange={onIncludeChange} />
  )),
];

type BulkImportGridProps = Readonly<{
  initialRows: BulkImportRow[];
  accounts: Account[];
  friends: Friend[];
  categories: string[];
  tags: string[];
  /** Called once an import has landed, so the caller can leave editing. */
  onImported?: () => void;
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
  onImported,
}: BulkImportGridProps) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const mutation = api.smsNotifications.bulkImport.useMutation();

  const onIncludeChange = useCallback((id: string, include: boolean) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, include } : row)));
  }, []);

  // History gives the starting vocabulary; anything typed into a row since is
  // added so it stays on offer for the other rows too.
  const tagOptions = useMemo(() => collectTagOptions(rows, tags), [rows, tags]);

  const columns = useMemo(
    () =>
      createBulkImportColumns({
        accounts,
        friends,
        categories,
        tags: tagOptions,
        onIncludeChange,
      }),
    [accounts, friends, categories, tagOptions, onIncludeChange],
  );

  const dataGrid = useEditableTable({
    mode: 'edit',
    data: rows,
    columns,
    getRowId: (row) => row.id,
    onDataChange: setRows,
    enableSearch: true,
    enablePaste: true,
  });

  const readiness = useMemo(() => getBulkImportReadiness(rows), [rows]);

  const { table } = dataGrid;
  const selectedIds = useMemo(
    () => new Set(table.getSelectedRowModel().rows.map((row) => row.id)),
    // The row model is rebuilt on selection change, so this has to follow the
    // selection state rather than the table object, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, table.getState().rowSelection],
  );

  const applyToSelected = useCallback(
    (patch: Partial<BulkImportRow>) => {
      setRows((current) => updateRows(current, selectedIds, patch));
    },
    [selectedIds],
  );

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
      onImported?.();
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
    <div className="flex flex-col gap-2.5">
      <EditableTable {...dataGrid} enablePagination={false} height={GRID_HEIGHT} />
      <BulkImportActionBar
        accounts={accounts.map((account) => ({
          label: account.accountName,
          value: account.id,
        }))}
        categories={categories}
        kinds={statementKindOptions}
        selectedCount={selectedIds.size}
        table={table}
        tags={tagOptions}
        onAddTag={(tag) => {
          setRows((current) => addTagToRows(current, selectedIds, tag));
        }}
        onClear={() => {
          table.toggleAllRowsSelected(false);
        }}
        onSetAccount={(accountId) => {
          applyToSelected({ accountId });
        }}
        onSetCategory={(category) => {
          applyToSelected({ category });
        }}
        onSetInclude={(include) => {
          applyToSelected({ include });
        }}
        onSetKind={(kind) => {
          applyToSelected({ statementKind: kind as BulkImportRow['statementKind'] });
        }}
      />
      {/* Sized to the pagination row this replaces, so the page below does not
          jump when the mode changes. */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-0">
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
          <span className="text-muted-foreground">Net {formatCurrency(net, rows[0].currency)}</span>
        </div>
        <Button
          disabled={!readiness.canImport || mutation.isPending}
          size="sm"
          onClick={onImport}
        >
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Import {readiness.included.length} transaction
          {readiness.included.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
};
