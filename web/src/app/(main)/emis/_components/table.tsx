'use client';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { type RouterOutput } from '@/server/routers';
import type { CreditCards } from '@/types/router-outputs';

import { createEmiColumns } from './emi-columns';
import { CreateEmiForm } from './emi-forms';

type EmiData = RouterOutput['emis']['getEmis'];

const Table = ({ data, creditCards }: { data: EmiData; creditCards: CreditCards }) => {
  const router = useRouter();
  const columns = createEmiColumns(() => {
    router.refresh();
  }, creditCards);

  const { table } = useDataTable({
    data: data.emis,
    columns,
    pageCount: data.pageCount,
    shallow: false,
  });

  return (
    <DataTable getItemValue={(item) => item.id} table={table}>
      <DataTableToolbar table={table}>
        <CreateEmiForm creditCards={creditCards} />
      </DataTableToolbar>
    </DataTable>
  );
};

export default Table;
