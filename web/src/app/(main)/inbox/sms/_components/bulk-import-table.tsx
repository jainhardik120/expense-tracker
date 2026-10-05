'use client';

import { useCallback, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { AlertCircle, Check, EyeOff, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import {
  addTagToRows,
  type BulkImportRow,
  collectTagOptions,
  getBulkImportReadiness,
  getRowProblem,
  parseGridDate,
  statementKindOptions,
  updateRows,
} from '@/lib/sms-bulk-import';
import type { ColumnDef } from '@/lib/table';
import { api } from '@/server/react';
import type { Account, Friend } from '@/types';

import { BulkImportActionBar } from './bulk-import-action-bar';

import {
  AmountEditor,
  DateEditor,
  EditableCell,
  SelectEditor,
  TagsEditor,
} from '../../../statements/_components/editable-cells';

const NONE = '__none__';

type Option = { label: string; value: string };

type RowPatch = (id: string, patch: Partial<BulkImportRow>) => void;

const labelFor = (options: Option[], value: string) =>
  options.find((option) => option.value === value)?.label;

const Muted = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);

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

const pickerColumn = ({
  id,
  label,
  options,
  onPatch,
}: {
  id: 'accountId' | 'friendId';
  label: string;
  options: Option[];
  onPatch: RowPatch;
}): ColumnDef<BulkImportRow> => ({
  id,
  header: label,
  cell: ({ row }) => {
    const value = row.original[id];
    return (
      <EditableCell
        columnId={id}
        display={labelFor(options, value) ?? <Muted>-</Muted>}
        mode="edit"
        rowIndex={row.index}
      >
        {({ stop }) => (
          <SelectEditor
            options={[{ label: 'None', value: NONE }, ...options]}
            stop={stop}
            value={value === '' ? NONE : value}
            onSave={(next) => {
              onPatch(row.original.id, { [id]: next === NONE ? '' : next });
            }}
          />
        )}
      </EditableCell>
    );
  },
  meta: { label },
});

const createColumns = ({
  accounts,
  friends,
  categories,
  tags,
  onPatch,
}: {
  accounts: Option[];
  friends: Option[];
  categories: string[];
  tags: string[];
  onPatch: RowPatch;
}): Array<ColumnDef<BulkImportRow>> => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        aria-label="Select every row"
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
    enableHiding: false,
    meta: { selectable: false },
    size: 40,
  },
  {
    id: 'date',
    header: 'Date',
    cell: ({ row }) => (
      <EditableCell
        columnId="date"
        display={<span className="whitespace-nowrap">{row.original.date}</span>}
        mode="edit"
        rowIndex={row.index}
      >
        {({ stop }) => (
          <DateEditor
            stop={stop}
            value={row.original.date}
            onSave={(next) => {
              if (parseGridDate(next) !== null) {
                onPatch(row.original.id, { date: next });
              }
            }}
          />
        )}
      </EditableCell>
    ),
    enableHiding: false,
  },
  {
    id: 'amount',
    header: 'Amount',
    cell: ({ row }) => (
      <EditableCell
        columnId="amount"
        display={formatCurrency(row.original.amount, row.original.currency)}
        mode="edit"
        rowIndex={row.index}
      >
        {({ stop, seed }) => (
          <AmountEditor
            seed={seed}
            stop={stop}
            value={row.original.amount.toFixed(2)}
            onSave={(next) => {
              onPatch(row.original.id, { amount: Number(next) });
            }}
          />
        )}
      </EditableCell>
    ),
    meta: { align: 'right', label: 'Amount' },
  },
  {
    id: 'merchant',
    header: 'Merchant',
    cell: ({ row }) => (
      <span className="block max-w-48 truncate" title={row.original.merchant}>
        {row.original.merchant === '' ? <Muted>-</Muted> : row.original.merchant}
      </span>
    ),
    meta: { label: 'Merchant' },
  },
  {
    id: 'bank',
    header: 'Bank',
    cell: ({ row }) => (
      <Muted>
        {row.original.bankName}
        {row.original.accountLast4 === '' ? '' : ` ····${row.original.accountLast4}`}
      </Muted>
    ),
    meta: { label: 'Bank' },
  },
  {
    id: 'statementKind',
    header: 'Kind',
    cell: ({ row }) => (
      <EditableCell
        columnId="statementKind"
        display={labelFor(statementKindOptions, row.original.statementKind)}
        mode="edit"
        rowIndex={row.index}
      >
        {({ stop }) => (
          <SelectEditor
            options={statementKindOptions}
            stop={stop}
            value={row.original.statementKind}
            onSave={(next) => {
              onPatch(row.original.id, {
                statementKind: next as BulkImportRow['statementKind'],
              });
            }}
          />
        )}
      </EditableCell>
    ),
    meta: { label: 'Kind' },
  },
  pickerColumn({ id: 'accountId', label: 'Account', options: accounts, onPatch }),
  pickerColumn({ id: 'friendId', label: 'Friend', options: friends, onPatch }),
  {
    id: 'category',
    header: 'Category',
    cell: ({ row }) => (
      <EditableCell
        columnId="category"
        display={row.original.category === '' ? <Muted>-</Muted> : row.original.category}
        mode="edit"
        rowIndex={row.index}
      >
        {({ stop }) => (
          <SelectEditor
            options={categories}
            stop={stop}
            value={row.original.category}
            onSave={(next) => {
              onPatch(row.original.id, { category: next });
            }}
          />
        )}
      </EditableCell>
    ),
    meta: { label: 'Category' },
  },
  {
    id: 'tags',
    header: 'Tags',
    cell: ({ row }) => (
      <EditableCell
        columnId="tags"
        display={
          row.original.tags.length === 0 ? (
            <Muted>-</Muted>
          ) : (
            <span className="flex gap-1">
              {row.original.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </span>
          )
        }
        mode="edit"
        rowIndex={row.index}
      >
        {({ stop }) => (
          <TagsEditor
            options={tags}
            stop={stop}
            value={row.original.tags}
            onSave={(next) => {
              onPatch(row.original.id, { tags: next });
            }}
          />
        )}
      </EditableCell>
    ),
    meta: { label: 'Tags' },
  },
  {
    id: 'status',
    header: '',
    cell: ({ row }) => (
      <div className="flex min-w-44 items-center justify-between gap-2">
        <RowStatus row={row.original} />
        <Button
          className="text-muted-foreground size-6 shrink-0"
          size="icon"
          title={row.original.include ? 'Leave this out of the import' : 'Put this back in'}
          variant="ghost"
          onClick={() => {
            onPatch(row.original.id, { include: !row.original.include });
          }}
        >
          {row.original.include ? (
            <EyeOff className="size-3.5" />
          ) : (
            <RotateCcw className="size-3.5" />
          )}
        </Button>
      </div>
    ),
    enableHiding: false,
    meta: { selectable: false },
  },
];

export const BulkImportTable = ({
  initialRows,
  accounts,
  friends,
  categories,
  tags,
  toolbar,
  onImported,
}: Readonly<{
  initialRows: BulkImportRow[];
  accounts: Account[];
  friends: Friend[];
  categories: string[];
  tags: string[];
  toolbar: React.ReactNode;
  onImported?: () => void;
}>) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const mutation = api.smsNotifications.bulkImport.useMutation();

  const onPatch = useCallback<RowPatch>((id, patch) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ label: account.accountName, value: account.id })),
    [accounts],
  );
  const friendOptions = useMemo(
    () => friends.map((friend) => ({ label: friend.name, value: friend.id })),
    [friends],
  );
  const tagOptions = useMemo(() => collectTagOptions(rows, tags), [rows, tags]);

  const columns = useMemo(
    () =>
      createColumns({
        accounts: accountOptions,
        friends: friendOptions,
        categories,
        tags: tagOptions,
        onPatch,
      }),
    [accountOptions, friendOptions, categories, tagOptions, onPatch],
  );

  const { table } = useDataTable({
    data: rows,
    columns,
    pageCount: -1,
    getRowId: (row) => row.id,
  });

  const selectedIds = new Set(table.getSelectedRowModel().rows.map((row) => row.id));
  const readiness = useMemo(() => getBulkImportReadiness(rows), [rows]);
  const net = readiness.included.reduce(
    (total, row) => total + (row.statementKind === 'expense' ? -row.amount : row.amount),
    0,
  );

  const applyToSelected = (patch: Partial<BulkImportRow>) => {
    setRows((current) => updateRows(current, selectedIds, patch));
  };

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
        result.stale > 0
          ? ` ${String(result.stale)} were no longer pending and were left alone.`
          : '';
      toast.success(`Imported ${String(result.imported)} transaction(s).${staleNote}`);
      router.refresh();
      onImported?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <DataTable
        actionBar={
          <BulkImportActionBar
            accounts={accountOptions}
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
        }
        enablePagination={false}
        getItemValue={(item) => item.id}
        table={table}
      >
        <DataTableToolbar
          table={table}
          title={
            <span className="text-muted-foreground text-sm font-normal">
              Filled in from how messages like these were filed before. Double-click a cell or start
              typing to correct it, untick what should stay out, then enter the rest at once.
            </span>
          }
        >
          {toolbar}
        </DataTableToolbar>
      </DataTable>
      {rows.length === 0 ? null : (
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 rounded-md border px-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{readiness.included.length} selected</Badge>
            {readiness.skipped > 0 ? (
              <Badge variant="outline">{readiness.skipped} skipped</Badge>
            ) : null}
            {readiness.problems.length > 0 ? (
              <Badge variant="destructive">
                {readiness.problems.length} need{readiness.problems.length === 1 ? 's' : ''}{' '}
                attention
              </Badge>
            ) : null}
            <span className="text-muted-foreground">
              Net {formatCurrency(net, rows[0]?.currency)}
            </span>
          </div>
          <Button
            disabled={!readiness.canImport || mutation.isPending}
            size="sm"
            onClick={() => {
              void onImport();
            }}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Import {readiness.included.length} transaction
            {readiness.included.length === 1 ? '' : 's'}
          </Button>
        </div>
      )}
    </div>
  );
};
