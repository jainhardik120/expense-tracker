'use client';

import { startTransition, useOptimistic, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Pencil, X } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { toast } from 'sonner';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
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

type OptimisticUpdateAction =
  | { action: 'update_all_items'; items: (Statement | SelfTransferStatement)[] }
  | {
      action: 'update_item';
      itemId: string;
      updatedItem: Statement | SelfTransferStatement;
    }
  | {
      action: 'unknown';
    };

/**
 * The statements, and the same statements being corrected.
 *
 * A real `<table>`, which is what decides how this file looks. The browser
 * sizes the columns from their contents and reflows them with the window;
 * nothing here states a width, a row height or a padding. Correcting a cell is
 * a renderer the column swaps in, not a different component drawing the list,
 * so throwing the switch cannot move anything.
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
  const [optimisticData, updateOptimisticData] = useOptimistic<
    (Statement | SelfTransferStatement)[],
    OptimisticUpdateAction
  >(data.statements, (prevData, updateVal) => {
    switch (updateVal.action) {
      case 'update_all_items':
        return updateVal.items;
      case 'update_item':
        return [
          ...prevData.filter((item) => item.id !== updateVal.itemId),
          updateVal.updatedItem,
        ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'unknown':
      default:
        return prevData;
    }
  });
  const [searchParams] = useQueryStates(statementParser);
  const router = useRouter();
  const updateStatement = api.statements.updateStatement.useMutation();
  const updateSelfTransferStatement = api.statements.updateSelfTransferStatement.useMutation();

  /**
   * Save one corrected field, leaving the rest of the statement as it was.
   *
   * The endpoint takes the whole record, so the fields nobody touched are sent
   * back unchanged rather than defaulted -- a patch that omitted them would
   * clear them.
   */
  const onCellSave = (statement: Statement, patch: Partial<Statement>) => {
    startTransition(async () => {
      await updateStatement.mutateAsync({
        id: statement.id,
        amount: statement.amount,
        category: statement.category,
        tags: statement.tags,
        statementKind: statement.statementKind,
        accountId: statement.accountId ?? undefined,
        friendId: statement.friendId ?? undefined,
        createdAt: statement.createdAt,
        ...patch,
      });
      toast.success('Statement updated');
      router.refresh();
    });
  };

  const columns = createStatementColumns({
    mode,
    onCellSave,
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
  const { table } = useDataTable({
    data: optimisticData,
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
  const { rows } = table.getRowModel();

  const modeButton = (
    <Button
      className="w-fit"
      size="sm"
      variant="outline"
      onClick={() => {
        setMode(mode === 'view' ? 'edit' : 'view');
      }}
    >
      {mode === 'view' ? <Pencil className="size-4" /> : <X className="size-4" />}
      {mode === 'view' ? 'Correct in place' : 'Done editing'}
    </Button>
  );

  return (
    <DataTable
      actionBar={<StatementTableActionBar table={table} />}
      // The screen is the table: the rows take what the toolbar and pagination
      // leave and scroll inside that, so the page itself never scrolls and the
      // pagination stays where it was put.
      fill
      getItemValue={(item) => item.id}
      table={table}
      onValueChange={(items) => {
        startTransition(async () => {
          updateOptimisticData({
            action: 'update_all_items',
            items: items.map((item) => item.original),
          });
          const originalIds = rows.map((row) => row.id);
          const newIds = items.map((row) => row.id);
          let maxDistance = 0;
          let droppedItem = null;
          for (let i = 0; i < newIds.length; i++) {
            const itemId = newIds[i];
            const prevIndex = originalIds.indexOf(itemId);
            const newIndex = i;
            if (prevIndex !== newIndex) {
              const distance = Math.abs(prevIndex - newIndex);
              if (distance > maxDistance) {
                maxDistance = distance;
                droppedItem = {
                  itemId,
                  prevIndex,
                  newIndex,
                  item: items[newIndex]?.original,
                };
              }
            }
          }
          if (droppedItem !== null) {
            const prevIndex =
              droppedItem.prevIndex < droppedItem.newIndex
                ? droppedItem.newIndex
                : droppedItem.newIndex - 1;
            const nextIndex =
              droppedItem.prevIndex < droppedItem.newIndex
                ? droppedItem.newIndex + 1
                : droppedItem.newIndex;
            let updatedTimestamp: Date;
            if (prevIndex < 0) {
              updatedTimestamp = new Date(data.statements[nextIndex].createdAt.getTime() + MINUTES);
            } else {
              updatedTimestamp = new Date(data.statements[prevIndex].createdAt.getTime() - MINUTES);
            }
            if (isSelfTransfer(droppedItem.item)) {
              await updateSelfTransferStatement.mutateAsync({
                ...droppedItem.item,
                createdAt: updatedTimestamp,
              });
            } else {
              await updateStatement.mutateAsync({
                ...droppedItem.item,
                createdAt: updatedTimestamp,
                accountId: droppedItem.item.accountId ?? undefined,
                friendId: droppedItem.item.friendId ?? undefined,
              });
            }
            toast.success('Statement updated successfully');
            router.refresh();
          }
        });
      }}
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
    </DataTable>
  );
};

export default Table;
