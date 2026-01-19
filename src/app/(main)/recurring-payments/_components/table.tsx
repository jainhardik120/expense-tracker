'use client';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/components/data-table/use-data-table';
import { recurringPaymentParser } from '@/types';

import { createRecurringPaymentColumns } from './RecurringPaymentColumns';
import { CreateRecurringPaymentForm } from './RecurringPaymentForms';

import type { RouterOutput } from '@/server/routers';

type RecurringPaymentsData = RouterOutput['recurringPayments']['getRecurringPayments'];
type RecurringPaymentsTableProps = Readonly<{
  data: RecurringPaymentsData;
}>;

export default function RecurringPaymentsTable({ data }: RecurringPaymentsTableProps) {
  const router = useRouter();
  const table = useDataTable({
    data: data.recurringPayments,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    columns: createRecurringPaymentColumns(() => {
      router.refresh();
    }),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
