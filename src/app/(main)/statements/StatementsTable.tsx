'use client';
import { use, useMemo } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableSortList } from '@/components/data-table/data-table-sort-list';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { type api } from '@/server/server';
import { type AllStatements } from '@/types';

import { createStatementColumns } from './StatementColumns';

const StatementsTable = ({
  promises,
}: {
  promises: Promise<[Awaited<ReturnType<typeof api.statements.getStatements>>]>;
}) => {
  const [statements] = use(promises);
  const columns = useMemo(() => createStatementColumns(() => {}), []);
  const { table } = useDataTable<AllStatements>({
    data: statements,
    columns,
    pageCount: 10,
    initialState: {
      sorting: [{ id: 'createdAt', desc: true }],
      columnPinning: { right: ['actions'] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: true,
    clearOnDefault: true,
  });
  return (
    <DataTable actionBar={<div>Actions</div>} table={table}>
      <DataTableToolbar table={table}>
        <DataTableSortList align="end" table={table} />
      </DataTableToolbar>
    </DataTable>
  );
};

export default StatementsTable;
