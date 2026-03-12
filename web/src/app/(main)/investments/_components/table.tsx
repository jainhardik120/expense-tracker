'use client';

import { useRouter } from 'next/navigation';

import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import { investmentKindLabels } from '@/lib/investments';
import { type RouterOutput } from '@/server/routers';

import {
  createInvestmentColumns,
  formatSignedCurrency,
  getSignedValueTone,
} from './InvestmentColumns';
import { CreateInvestmentForm } from './InvestmentForms';
import { InvestmentsOverview } from './InvestmentsOverview';

type InvestmentsPageData = RouterOutput['investments']['getInvestmentsPageData'];
type TimelineFilters = {
  start?: Date;
  end?: Date;
  investmentKind: string[];
};
const UNITS_DECIMALS = 4;
type GroupedInvestmentRow = InvestmentsPageData['dashboard']['instrumentBreakdown'][number];

const groupedInvestmentColumns: ColumnDef<GroupedInvestmentRow>[] = [
  {
    accessorKey: 'kind',
    header: 'Type',
    cell: ({ row }) => investmentKindLabels[row.original.kind],
  },
  {
    accessorKey: 'name',
    header: 'Instrument',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="text-muted-foreground text-xs">{row.original.code}</div>
      </div>
    ),
  },
  {
    id: 'positionCounts',
    header: 'Open / Closed',
    cell: ({ row }) => `${row.original.openPositions} / ${row.original.closedPositions}`,
  },
  {
    accessorKey: 'units',
    header: 'Units Held',
    cell: ({ row }) => (
      <div className="text-right">{row.original.units.toFixed(UNITS_DECIMALS)}</div>
    ),
  },
  {
    accessorKey: 'averageBuyPrice',
    header: 'Avg Buy Price',
    cell: ({ row }) => (
      <div className="text-right">
        {row.original.averageBuyPrice === null ? '-' : formatCurrency(row.original.averageBuyPrice)}
      </div>
    ),
  },
  {
    accessorKey: 'currentUnitPrice',
    header: 'Current Unit Price',
    cell: ({ row }) => (
      <div className="text-right">
        {row.original.currentUnitPrice === null
          ? '-'
          : formatCurrency(row.original.currentUnitPrice)}
      </div>
    ),
  },
  {
    accessorKey: 'investedAmount',
    header: 'Invested',
    cell: ({ row }) => (
      <div className="text-right">{formatCurrency(row.original.investedAmount)}</div>
    ),
  },
  {
    accessorKey: 'valuationAmount',
    header: 'Current Value',
    cell: ({ row }) => (
      <div className="text-right">{formatCurrency(row.original.valuationAmount)}</div>
    ),
  },
  {
    accessorKey: 'pnl',
    header: 'P/L',
    cell: ({ row }) => (
      <div className={`text-right ${getSignedValueTone(row.original.pnl)}`}>
        {formatSignedCurrency(row.original.pnl)}
        {row.original.pnlPercentage === null ? '' : ` (${row.original.pnlPercentage.toFixed(2)}%)`}
      </div>
    ),
  },
  {
    accessorKey: 'dayChange',
    header: '1D Change',
    cell: ({ row }) => (
      <div className={`text-right ${getSignedValueTone(row.original.dayChange)}`}>
        {formatSignedCurrency(row.original.dayChange)}
        {row.original.dayChangePercentage === null
          ? ''
          : ` (${row.original.dayChangePercentage.toFixed(2)}%)`}
      </div>
    ),
  },
];

const Table = ({ data, filters }: { data: InvestmentsPageData; filters: TimelineFilters }) => {
  const router = useRouter();
  const columns = createInvestmentColumns(() => {
    router.refresh();
  });

  const { table } = useDataTable({
    data: data.table.investments,
    columns,
    pageCount: data.table.pageCount,
    shallow: false,
  });
  const { table: groupedTable } = useDataTable({
    data: data.dashboard.instrumentBreakdown,
    columns: groupedInvestmentColumns,
    pageCount: 1,
  });

  return (
    <div className="grid gap-4">
      <InvestmentsOverview
        dashboard={data.dashboard}
        filters={filters}
        instrumentTimelines={data.instrumentTimelines}
      />
      <DataTable
        enablePagination={false}
        getItemValue={(item) => `${item.kind}:${item.code}`}
        table={groupedTable}
      />
      <DataTable getItemValue={(item) => item.id} table={table}>
        <DataTableToolbar table={table}>
          <CreateInvestmentForm />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
};

export default Table;
