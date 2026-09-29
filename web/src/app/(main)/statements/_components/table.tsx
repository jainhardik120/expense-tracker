'use client';

import { startTransition, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Pencil, X } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { toast } from 'sonner';

import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { EditableTable } from '@/components/editable-table/editable-table';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { useEditableTable } from '@/hooks/use-editable-table';
import { STATEMENTS_PAGE_SIZE_KEY } from '@/lib/page-size';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import {
  isSelfTransfer,
  type SelfTransferStatement,
  type Statement,
  type Account,
  type Friend,
  MINUTES,
  statementParser,
} from '@/types';

import { BulkImportDialog } from './bulk-import-dialog';
import { CreateSelfTransferStatementForm } from './SelfTransferStatementForms';
import StatementTableActionBar from './statement-table-action-bar';
import { createStatementColumns } from './StatementColumns';
import { CreateStatementForm } from './StatementForms';

type StatementData = RouterOutput['statements']['getStatements'];
type FacetCounts = RouterOutput['statements']['getFacetCounts'];

/** How tall the rows area is allowed to grow before it scrolls internally. */
const GRID_HEIGHT = 640;

/**
 * The statements, and the same statements being corrected.
 *
 * The grid draws the rows in both modes, so throwing the switch changes what a
 * cell does rather than what is on screen: no remount, no re-measure, and the
 * row under the pointer stays where it is.
 */
const Table = ({
  data,
  accountsData,
  friendsData,
  categories,
  tags,
  facetCounts,
}: {
  data: StatementData;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
  tags: string[];
  facetCounts: FacetCounts;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const updateStatement = api.statements.updateStatement.useMutation();
  const [searchParams] = useQueryStates(statementParser);
  const router = useRouter();

  const updateSelfTransferStatement = api.statements.updateSelfTransferStatement.useMutation();

  /**
   * Put a row where it was dropped, by moving its clock.
   *
   * There is no order column: the list is sorted by when a statement happened,
   * so the only way to say "this one comes before that one" is to say it
   * happened a minute earlier. The dropped row is given a time either side of
   * where it landed, which is what the drag handle meant all along.
   */
  const onReorder = (from: number, to: number) => {
    const rows = data.statements;
    const moved = rows.at(from);
    if (moved === undefined || from === to) {
      return;
    }
    // The neighbour to sit next to depends on which way it travelled: dragged
    // down it lands after the row it was dropped on, dragged up it lands
    // before.
    const anchor = rows.at(to);
    if (anchor === undefined) {
      return;
    }
    const createdAt = new Date(
      from < to ? anchor.createdAt.getTime() - MINUTES : anchor.createdAt.getTime() + MINUTES,
    );
    startTransition(async () => {
      if (isSelfTransfer(moved)) {
        await updateSelfTransferStatement.mutateAsync({ ...moved, createdAt });
      } else {
        await updateStatement.mutateAsync({
          id: moved.id,
          amount: moved.amount,
          category: moved.category,
          tags: moved.tags,
          statementKind: moved.statementKind,
          accountId: moved.accountId ?? undefined,
          friendId: moved.friendId ?? undefined,
          createdAt,
        });
      }
      toast.success('Statement moved');
      router.refresh();
    });
  };

  const columns = createStatementColumns({
    onReorder,
    onRefreshStatements: () => {
      router.refresh();
    },
    accountsData,
    friendsData,
    categories,
    tags,
    facetCounts,
    activeFilters: { category: searchParams.category, tags: searchParams.tags },
    startingBalance:
      data.summary === null
        ? undefined
        : {
            name:
              'friend' in data.summary
                ? data.summary.friend.name
                : data.summary.account.accountName,
            amount: data.summary.finalBalance,
          },
  });

  // The list keeps its sorting, filters and page in the URL, and goes on owning
  // them while the grid draws the rows.
  const { table } = useDataTable({
    data: data.statements,
    columns,
    pageCount: data.pageCount,
    persistPageSizeKey: STATEMENTS_PAGE_SIZE_KEY,
    shallow: false,
    // The query orders by date descending when asked for nothing in
    // particular, so the table says so rather than calling itself unsorted.
    // Left implicit, the first click on Date applied the descending order that
    // was already showing, and it took a second click to reach ascending.
    initialState: { sorting: [{ id: 'date', desc: true }] },
    // Without this the cycle runs descending, ascending, then back to a state
    // the header calls unsorted but which is descending all the same.
    enableSortingRemoval: false,
  });

  /**
   * Save whatever the grid just changed.
   *
   * The grid hands back the whole page, so the row that moved is found by
   * comparing against what the server sent. Only the fields with an editor are
   * compared: everything else in the row is the server's and is sent back
   * unchanged.
   *
   * Self transfers are skipped. They have no category and no tags, and the two
   * sides of one are a different record with a different endpoint -- editing
   * one through this form would quietly write half of it.
   */
  const onDataChange = (next: (Statement | SelfTransferStatement)[]) => {
    const before = new Map(data.statements.map((row) => [row.id, row]));
    const edited = next.filter((row) => {
      const original = before.get(row.id);
      if (original === undefined || isSelfTransfer(row) || isSelfTransfer(original)) {
        return false;
      }
      return (
        original.amount !== row.amount ||
        original.category !== row.category ||
        original.tags.join('\u0000') !== row.tags.join('\u0000')
      );
    });
    if (edited.length === 0) {
      return;
    }
    startTransition(async () => {
      for (const row of edited) {
        if (isSelfTransfer(row)) {
          continue;
        }
        await updateStatement.mutateAsync({
          id: row.id,
          amount: row.amount,
          category: row.category,
          tags: row.tags,
          statementKind: row.statementKind,
          accountId: row.accountId ?? undefined,
          friendId: row.friendId ?? undefined,
          createdAt: row.createdAt,
        });
      }
      toast.success(edited.length === 1 ? 'Statement updated' : `${edited.length} statements updated`);
      router.refresh();
    });
  };

  const grid = useEditableTable<Statement | SelfTransferStatement>({
    mode,
    onDataChange,
    data: data.statements,
    columns,
    getRowId: (row) => row.id,
    state: table.getState(),
    onSortingChange: table.setSorting,
    onColumnFiltersChange: table.setColumnFilters,
    onRowSelectionChange: table.setRowSelection,
    onPaginationChange: table.setPagination,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: data.pageCount,
    enableSearch: true,
    initialHeight: GRID_HEIGHT,
    // Without it the tick boxes render and do nothing: toggleSelected is a
    // no-op on a table that was never told rows can be selected, so the action
    // bar never appeared.
    enableRowSelection: true,
  });

  const modeButton =
    mode === 'view' ? (
      <Button
        className="w-fit"
        size="sm"
        variant="outline"
        onClick={() => {
          setMode('edit');
        }}
      >
        <Pencil className="size-4" />
        Correct in place
      </Button>
    ) : (
      <Button
        className="w-fit"
        size="sm"
        variant="outline"
        onClick={() => {
          setMode('view');
        }}
      >
        <X className="size-4" />
        Done editing
      </Button>
    );

  return (
    <EditableTable
      {...grid}
      // The grid's table, not the list's: the grid draws the rows and owns the
      // ticking, and the bar has to read the selection from the same instance
      // the tick boxes wrote it to.
      actionBar={<StatementTableActionBar table={grid.table} />}
      // Reading should look like the table it replaced: the grid rules every
      // cell off from its neighbour, which reads as a spreadsheet rather than a
      // list. The lines come back where they earn their place -- while editing,
      // where a cell is a thing you land on rather than a column of text.
      className={
        mode === 'view' ? '[&_[role=gridcell]]:border-e-0 [&_[role=columnheader]]:border-e-0' : ''
      }
      height={GRID_HEIGHT}
      // Every column shares the extra width, which is what a table does with
      // it. Stretching only the last one sent all of it to the actions column
      // and left the rest at the width they were declared at.
      stretchColumns
    >
      <DataTableToolbar table={table}>
        {modeButton}
        <BulkImportDialog
          onImportSuccess={() => {
            router.refresh();
          }}
        />
        <CreateSelfTransferStatementForm accountsData={accountsData} />
        <CreateStatementForm
          accountsData={accountsData}
          categories={categories}
          friendsData={friendsData}
        />
      </DataTableToolbar>
    </EditableTable>
  );
};

export default Table;
