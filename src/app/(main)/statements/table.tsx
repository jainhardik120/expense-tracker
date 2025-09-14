'use client';

import { startTransition, useOptimistic } from 'react';

import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import {
  isSelfTransfer,
  type SelfTransferStatement,
  type Statement,
  type Account,
  type Friend,
  MINUTES,
} from '@/types';

import { CreateSelfTransferStatementForm } from './SelfTransferStatementForms';
import { createStatementColumns } from './StatementColumns';
import { CreateStatementForm } from './StatementForms';

type StatementData = RouterOutput['statements']['getStatements'];

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
}: {
  data: StatementData;
  accountsData: Account[];
  friendsData: Friend[];
}) => {
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
  const router = useRouter();
  const columns = createStatementColumns(
    () => {
      router.refresh();
    },
    accountsData,
    friendsData,
    data.summary !== null
      ? {
          name:
            'friend' in data.summary ? data.summary.friend.name : data.summary.account.accountName,
          amount: data.summary.finalBalance,
        }
      : undefined,
  );
  const { table } = useDataTable({
    data: optimisticData,
    columns,
    pageCount: data.pageCount,
    shallow: false,
  });
  const { rows } = table.getRowModel();
  const updateStatement = api.statements.updateStatement.useMutation();
  const updateSelfTransferStatement = api.statements.updateSelfTransferStatement.useMutation();
  return (
    <DataTable
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
            } else if (nextIndex >= data.statements.length) {
              updatedTimestamp = new Date(data.statements[prevIndex].createdAt.getTime() - MINUTES);
            } else {
              updatedTimestamp = new Date(
                (data.statements[prevIndex].createdAt.getTime() +
                  data.statements[nextIndex].createdAt.getTime()) /
                  2,
              );
            }
            if (isSelfTransfer(droppedItem.item)) {
              await updateSelfTransferStatement.mutateAsync({
                id: droppedItem.item.id,
                createSelfTransferSchema: {
                  ...droppedItem.item,
                  createdAt: updatedTimestamp,
                },
              });
            } else {
              await updateStatement.mutateAsync({
                id: droppedItem.item.id,
                createStatementSchema: {
                  ...droppedItem.item,
                  createdAt: updatedTimestamp,
                  accountId: droppedItem.item.accountId ?? undefined,
                  friendId: droppedItem.item.friendId ?? undefined,
                },
              });
            }
            toast.success('Statement updated successfully');
            router.refresh();
          }
        });
      }}
    >
      <DataTableToolbar table={table}>
        <CreateSelfTransferStatementForm accountsData={accountsData} />
        <CreateStatementForm accountsData={accountsData} friendsData={friendsData} />
      </DataTableToolbar>
    </DataTable>
  );
};

export default Table;
