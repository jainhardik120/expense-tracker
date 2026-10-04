'use client';

import { useMemo } from 'react';

import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ZonedDate } from '@/components/zoned-date';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';

import { type SalaryData } from './shared';

type TaxableStatement = SalaryData['taxableStatements'][number];

const taxableStatementColumns: ColumnDef<TaxableStatement>[] = [
  {
    id: 'date',
    accessorFn: (statement) => statement.createdAt,
    header: 'Date',
    cell: ({ row }) => <ZonedDate value={row.original.createdAt} />,
  },
  {
    id: 'statement',
    accessorFn: (statement) => statement.category,
    header: 'Statement',
    cell: ({ row }) => <span className="font-medium">{row.original.category}</span>,
  },
  {
    id: 'taxable',
    accessorFn: (statement) => statement.taxableAmount,
    header: 'Taxable',
    cell: ({ row }) => (
      <span className="font-semibold tabular-nums">
        {formatCurrency(row.original.taxableAmount)}
      </span>
    ),
    meta: { align: 'right' },
  },
];

const Tile = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="rounded-lg border p-2">
    <p className="text-muted-foreground text-xs">{label}</p>
    <p className={`text-base font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
  </div>
);

export const OutsideIncomeCard = ({ data }: { data: SalaryData }) => {
  const columns = useMemo(() => taxableStatementColumns, []);
  const { table } = useDataTable({ data: data.taxableStatements, columns, pageCount: -1 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Taxable income outside salary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="Marked statements"
            value={formatCurrency(data.summary.statementTaxableIncome)}
          />
          <Tile
            label="Future estimate"
            value={formatCurrency(data.summary.additionalEstimatedTaxableIncome)}
          />
          <Tile label="Total outside" value={formatCurrency(data.summary.outsideTaxableIncome)} />
          <Tile
            label="Extra tax to pay"
            tone="text-amber-700 dark:text-amber-300"
            value={formatCurrency(data.summary.estimatedOutsideIncomeTax)}
          />
        </div>
        {data.taxableStatements.length === 0 ? (
          <p className="text-muted-foreground text-sm">No taxable outside statements marked.</p>
        ) : (
          <DataTable
            background={false}
            enablePagination={false}
            getItemValue={(statement) => statement.id}
            showBorder={false}
            table={table}
          />
        )}
      </CardContent>
    </Card>
  );
};
