'use client';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/components/data-table/use-data-table';
import { type RouterOutput } from '@/server/routers';
import { recurringPaymentParser } from '@/types';

import { createRecurringPaymentColumns } from './RecurringPaymentColumns';
import { CreateRecurringPaymentForm } from './RecurringPaymentForms';

type RecurringPaymentsData = RouterOutput['recurringPayments']['getRecurringPayments'];

export default function RecurringPaymentsTable({ data }: { data: RecurringPaymentsData }) {
  const router = useRouter();
  const table = useDataTable({
    data: data.recurringPayments,
    columns: createRecurringPaymentColumns(() => {
      router.refresh();
    }),
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
