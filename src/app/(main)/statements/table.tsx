'use client';

import { startTransition, useOptimistic } from 'react';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import {
  isSelfTransfer,
  MINUTES,
  type SelfTransferStatement,
  type Statement,
  type Account,
  type Friend,
} from '@/types';

import { createStatementColumns } from './StatementColumns';

type StatementData = RouterOutput['statements']['getStatements'];

type OptimisticUpdateAction =
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
    if (updateVal.action === 'update_item') {
      return [
        ...prevData.filter((item) => item.id !== updateVal.itemId),
        updateVal.updatedItem,
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return prevData;
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
  const updateStatement = api.statements.updateStatement.useMutation();
  const updateSelfTransferStatement = api.statements.updateSelfTransferStatement.useMutation();
  return (
    <DataTable
      table={table}
      onItemDropped={(droppedItem) => {
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
        startTransition(async () => {
          updateOptimisticData({
            action: 'update_item',
            itemId: droppedItem.item.id,
            updatedItem: {
              ...droppedItem.item,
              createdAt: updatedTimestamp,
            },
          });
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
          router.refresh();
        });
      }}
    >
      <DataTableToolbar table={table} />
    </DataTable>
  );
};

export default Table;
