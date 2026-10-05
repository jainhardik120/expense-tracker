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
  MS_PER_MINUTE,
  statementParser,
} from '@/types';

import { BulkImportDialog } from './bulk-import-dialog';
import { CreateSelfTransferStatementForm } from './self-transfer-statement-forms';
import { createStatementColumns } from './statement-columns';
import { CreateStatementForm } from './statement-forms';
import StatementTableActionBar from './statement-table-action-bar';

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
  const [anchorRow, setAnchorRow] = useState<number | null>(null);
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
  const updateSharedStatement = api.friends.updateSharedStatement.useMutation();
  const updateSelfTransferStatement = api.statements.updateSelfTransferStatement.useMutation();

  const onCellSave = (statement: Statement, patch: Partial<Statement>) => {
    startTransition(async () => {
      const { shareKind } = statement;
      if (shareKind !== 'own') {
        await updateSharedStatement.mutateAsync({
          shareKind,
          sourceId: statement.id,
          category: patch.category ?? statement.category,
          tags: patch.tags ?? statement.tags,
        });
        toast.success('Statement updated');
        router.refresh();
        return;
      }
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
    anchorRow,
    setAnchorRow,
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
    initialState: { sorting: [{ id: 'date', desc: true }] },
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
      enableCellSelection={mode === 'view'}
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
              updatedTimestamp = new Date(
                data.statements[nextIndex].createdAt.getTime() + MS_PER_MINUTE,
              );
            } else {
              updatedTimestamp = new Date(
                data.statements[prevIndex].createdAt.getTime() - MS_PER_MINUTE,
              );
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
