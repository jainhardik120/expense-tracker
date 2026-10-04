'use client';

import { format, parse } from 'date-fns';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency, DATE_FORMAT } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { YearDetail } from '@/types/router-outputs';

import type { ColumnDef } from '@tanstack/react-table';

type CycleRow = {
  key: string;
  label: string;
  perLine: Record<string, number>;
  total: number;
  isAverage: boolean;
};

const EMPHASIS = 'font-semibold';

const cycleColumns = (names: string[]): ColumnDef<CycleRow>[] => [
  {
    id: 'cycle',
    header: 'Cycle',
    cell: ({ row }) => (
      <span className={cn('whitespace-nowrap', row.original.isAverage && EMPHASIS)}>
        {row.original.label}
      </span>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  ...names.map<ColumnDef<CycleRow>>((name) => ({
    id: name,
    header: name,
    cell: ({ row }) => {
      const value = row.original.perLine[name] ?? 0;
      return (
        <span className={row.original.isAverage ? EMPHASIS : undefined}>
          {value === 0 && !row.original.isAverage ? '—' : formatCurrency(value)}
        </span>
      );
    },
    enableSorting: false,
    meta: { align: 'right', label: name },
  })),
  {
    id: 'total',
    header: 'Total',
    cell: ({ row }) => (
      <span className={row.original.isAverage ? EMPHASIS : 'font-medium'}>
        {formatCurrency(row.original.total)}
      </span>
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { align: 'right' },
  },
];

export const BudgetCycles = ({ detail }: { detail: YearDetail }) => {
  const { cycles, lines } = detail;
  const names = [...lines].sort((a, b) => a.position - b.position).map((line) => line.name);
  const used = names.filter((name) => cycles.some((cycle) => (cycle.perLine[name] ?? 0) !== 0));

  const columnTotal = (name: string) =>
    cycles.reduce((sum, cycle) => sum + (cycle.perLine[name] ?? 0), 0);

  const rows: CycleRow[] = [
    ...cycles.map((cycle) => ({
      key: cycle.cycle,
      label: format(parse(cycle.cycle, 'yyyy-MM', new Date()), DATE_FORMAT.month),
      perLine: cycle.perLine,
      total: cycle.total,
      isAverage: false,
    })),
    {
      key: '__average__',
      label: 'Average',
      perLine: Object.fromEntries(
        used.map((name) => [name, cycles.length > 0 ? columnTotal(name) / cycles.length : 0]),
      ),
      total: cycles.length > 0 ? cycles.reduce((sum, c) => sum + c.total, 0) / cycles.length : 0,
      isAverage: true,
    },
  ];

  const { table } = useDataTable({
    data: rows,
    columns: cycleColumns(used),
    pageCount: -1,
  });

  return (
    <DataTable enablePagination={false} getItemValue={(item) => item.key} table={table}>
      <DataTableToolbar table={table} title="Every pay cycle" />
    </DataTable>
  );
};
