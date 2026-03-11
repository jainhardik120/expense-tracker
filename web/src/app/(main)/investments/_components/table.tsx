'use client';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { type RouterOutput } from '@/server/routers';

import { createInvestmentColumns } from './InvestmentColumns';
import { CreateInvestmentForm } from './InvestmentForms';
import { InvestmentsOverview } from './InvestmentsOverview';

type InvestmentData = RouterOutput['investments']['getInvestments'];
type InvestmentDashboardData = RouterOutput['investments']['getInvestmentsDashboard'];

const Table = ({ data, dashboard }: { data: InvestmentData; dashboard: InvestmentDashboardData }) => {
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
    <div className="grid gap-4">
      <InvestmentsOverview dashboard={dashboard} />
      <DataTable getItemValue={(item) => item.id} table={table}>
        <DataTableToolbar table={table}>
          <CreateInvestmentForm />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
};

export default Table;
