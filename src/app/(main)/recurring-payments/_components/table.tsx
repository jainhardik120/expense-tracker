'use client';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import type { RouterOutput } from '@/server/routers';
import { recurringPaymentParser } from '@/types';

import { createRecurringPaymentColumns } from './RecurringPaymentColumns';
import { CreateRecurringPaymentForm } from './RecurringPaymentForms';

type RecurringPaymentsData = RouterOutput['recurringPayments']['getRecurringPayments'];
type RecurringPaymentsTableProps = Readonly<{
  data: RecurringPaymentsData;
}>;

export default function RecurringPaymentsTable({ data }: RecurringPaymentsTableProps) {
  const router = useRouter();
  const columns = createRecurringPaymentColumns(() => {
    router.refresh();
  });

  const { table } = useDataTable({
    data: data.recurringPayments,
    columns,
    pageCount: data.pageCount,
    defaultPerPage: 10,
    parser: recurringPaymentParser,
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table}>
        <CreateRecurringPaymentForm />
      </DataTableToolbar>
    </DataTable>
  );
}
