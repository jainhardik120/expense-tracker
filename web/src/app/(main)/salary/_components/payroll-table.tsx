'use client';

import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { ZonedDate } from '@/components/zoned-date';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import { hasMaterialSalaryNetMismatch } from '@/lib/salary';
import type { ColumnDef } from '@/lib/table';
import { cn } from '@/lib/utils';

import { PayrollBreakdownDialog } from './payroll-breakdown-dialog';
import { PaymentDialog, SalarySetupDialog, TaxSettingsDialog } from './salary-dialogs';
import { formatPeriod, type SalaryData, type SalaryRow, statusPresentation } from './shared';

const money = (value: number) => <span className="tabular-nums">{formatCurrency(value)}</span>;

const createPayrollColumns = (data: SalaryData, refresh: () => void): ColumnDef<SalaryRow>[] => [
  {
    id: 'period',
    accessorFn: (row) => formatPeriod(row.periodStart),
    header: 'Period',
    cell: ({ row }) => (
      <span className="font-medium">{formatPeriod(row.original.periodStart)}</span>
    ),
    meta: { label: 'Period' },
  },
  {
    id: 'paymentDate',
    accessorFn: (row) => row.paymentDate,
    header: 'Pay date',
    cell: ({ row }) => <ZonedDate value={row.original.paymentDate} />,
    meta: { label: 'Pay date' },
  },
  {
    id: 'status',
    accessorFn: (row) => row.status,
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={statusPresentation[row.original.status].variant}>
        {statusPresentation[row.original.status].label}
      </Badge>
    ),
    meta: { label: 'Status' },
  },
  {
    id: 'earnings',
    accessorFn: (row) => row.totals.earnings,
    header: 'Earnings',
    cell: ({ row }) => money(row.original.totals.earnings),
    meta: { align: 'right', label: 'Earnings' },
  },
  {
    id: 'deductions',
    accessorFn: (row) => row.totals.deductions,
    header: 'Deductions',
    cell: ({ row }) => money(row.original.totals.deductions),
    meta: { align: 'right', label: 'Deductions' },
  },
  {
    id: 'tds',
    accessorFn: (row) => row.totals.tds,
    header: 'TDS',
    cell: ({ row }) => money(row.original.totals.tds),
    meta: { align: 'right', label: 'TDS' },
  },
  {
    id: 'net',
    accessorFn: (row) => row.totals.net,
    header: 'Net',
    cell: ({ row }) => (
      <span
        className={cn(
          'font-semibold tabular-nums',
          hasMaterialSalaryNetMismatch(row.original.statementAmount, row.original.totals.net) &&
            'text-destructive',
        )}
      >
        {formatCurrency(row.original.totals.net)}
      </span>
    ),
    meta: { align: 'right', label: 'Net' },
  },
  {
    id: 'taxable',
    accessorFn: (row) => row.totals.taxableIncome,
    header: 'Taxable',
    cell: ({ row }) => money(row.original.totals.taxableIncome),
    meta: { align: 'right', label: 'Taxable' },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div className="flex justify-end">
        <PayrollBreakdownDialog row={row.original} />
        <PaymentDialog
          bonuses={data.bonuses}
          components={data.components}
          row={row.original}
          onSaved={refresh}
        />
      </div>
    ),
    enableHiding: false,
  },
];

export const PayrollTable = ({ data, refresh }: { data: SalaryData; refresh: () => void }) => {
  const columns = useMemo(() => createPayrollColumns(data, refresh), [data, refresh]);
  const { table } = useDataTable({
    data: data.rows,
    columns,
    pageCount: -1,
    getRowId: (row) => `${row.revisionId}-${row.periodStart.toISOString()}`,
  });

  return (
    <DataTable
      enablePagination={false}
      getItemValue={(row) => `${row.revisionId}-${row.periodStart.toISOString()}`}
      table={table}
    >
      <DataTableToolbar table={table}>
        <SalarySetupDialog data={data} onSaved={refresh} />
        <TaxSettingsDialog data={data} onSaved={refresh} />
      </DataTableToolbar>
    </DataTable>
  );
};
