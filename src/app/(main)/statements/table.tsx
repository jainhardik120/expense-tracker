'use client';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { type RouterOutput } from '@/server/routers';
import type { Account, Friend } from '@/types';

import { createStatementColumns } from './StatementColumns';

type StatementData = RouterOutput['statements']['getStatements'];

const Table = ({
  data,
  accountsData,
  friendsData,
}: {
  data: StatementData;
  accountsData: Account[];
  friendsData: Friend[];
}) => {
  const router = useRouter();
  const columns = createStatementColumns(
    () => {
      router.refresh();
    },
    accountsData,
    friendsData,
  );
  const { table } = useDataTable({
    data: data.statements,
    columns,
    pageCount: data.pageCount,
    shallow: false,
  });
  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
};

export default Table;
