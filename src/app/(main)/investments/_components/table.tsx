'use client';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { type RouterOutput } from '@/server/routers';

import { createInvestmentColumns } from './InvestmentColumns';
import { CreateInvestmentForm } from './InvestmentForms';

type InvestmentData = RouterOutput['investments']['getInvestments'];

const Table = ({ data }: { data: InvestmentData }) => {
  const router = useRouter();
  const columns = createInvestmentColumns(() => {
    router.refresh();
  });

  const { table } = useDataTable({
    data: data.investments,
    columns,
    pageCount: data.pageCount,
    shallow: false,
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table}>
        <CreateInvestmentForm />
      </DataTableToolbar>
    </DataTable>
  );
};

export default Table;
