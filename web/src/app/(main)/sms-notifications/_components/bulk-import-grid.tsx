'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

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
import type { ColumnDef, Row, CoreTable } from '@/lib/table';
import { api } from '@/server/react';
import type { Account, Friend } from '@/types';
import type { CellOpts } from '@/types/data-grid';

import { BulkImportActionBar } from './bulk-import-action-bar';
import { SMS_COLUMN_SIZE } from './column-sizes';

const GRID_HEIGHT = 620;

const SELECT_COLUMN_ID = 'select';
const STATUS_COLUMN_ID = 'actions';

const toOptions = (values: string[]) => values.map((value) => ({ label: value, value }));

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

const SelectRowCell = ({
  row,
  table,
}: {
  row: Row<BulkImportRow>;
  table: CoreTable<BulkImportRow>;
}) => {
  const shiftHeld = useRef(false);
  const { meta } = table.options;
  return (
    <Checkbox
      aria-label={`Select ${row.original.merchant === '' ? row.original.bankName : row.original.merchant}`}
      checked={row.getIsSelected()}
      onCheckedChange={(checked) => {
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
  onImported?: () => void;
}>;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, table.state.rowSelection],
  );

  const applyToSelected = useCallback(
    (patch: Partial<BulkImportRow>) => {
      setRows((current) => updateRows(current, selectedIds, patch));
    },
    [selectedIds],
  );

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
        <Button disabled={!readiness.canImport || mutation.isPending} size="sm" onClick={onImport}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Import {readiness.included.length} transaction
          {readiness.included.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
};
