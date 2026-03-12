'use client';

import { useRouter } from 'next/navigation';

import { type ColumnDef } from '@tanstack/react-table';
import { Info } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import { investmentKindLabels } from '@/lib/investments';
import { type RouterOutput } from '@/server/routers';

import { createInvestmentColumns, getSignedValueTone } from './InvestmentColumns';
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
const USD_CURRENCY = 'USD';
const INR_CURRENCY = 'INR';

const formatByCurrency = (value: number, currency: string) => {
  const locale = currency === USD_CURRENCY ? 'en-US' : 'en-IN';
  return formatCurrency(value, currency, locale);
};

const formatSignedByCurrency = (value: number, currency: string) => {
  const abs = Math.abs(value);
  const formatted = formatByCurrency(abs, currency);
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
};

const GroupedFxPopover = ({ row }: { row: GroupedInvestmentRow }) => {
  if (row.displayCurrency !== USD_CURRENCY) {
    return <span>-</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="h-7 px-2" size="sm" variant="outline">
          <Info className="mr-1 size-3.5" />
          FX
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-xs">
        <div className="grid gap-1">
          <div className="font-semibold">USD to INR Details</div>
          <div>Buy value (USD): {formatByCurrency(row.investedAmount, USD_CURRENCY)}</div>
          <div>
            Buy value (INR @ purchase-date FX):{' '}
            {row.buyValueInrAtPurchaseFx === null
              ? '-'
              : formatByCurrency(row.buyValueInrAtPurchaseFx, INR_CURRENCY)}
          </div>
          <div>Current value (USD): {formatByCurrency(row.valuationAmount, USD_CURRENCY)}</div>
          <div>
            Current value (INR @ today FX):{' '}
            {row.currentValueInrAtCurrentFx === null
              ? '-'
              : formatByCurrency(row.currentValueInrAtCurrentFx, INR_CURRENCY)}
          </div>
          <div>
            Purchase FX: {row.buyFxRateToInr === null ? '-' : row.buyFxRateToInr.toFixed(4)}
          </div>
          <div>
            Today FX: {row.currentFxRateToInr === null ? '-' : row.currentFxRateToInr.toFixed(4)}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const groupedInvestmentColumns: ColumnDef<GroupedInvestmentRow>[] = [
  {
    accessorKey: 'kind',
    header: 'Type',
    cell: ({ row }) => investmentKindLabels[row.original.kind],
  },
  {
    accessorKey: 'stockMarket',
    header: 'Market',
    cell: ({ row }) => (row.original.kind === 'stocks' ? (row.original.stockMarket ?? 'IN') : '-'),
  },
  {
    accessorKey: 'name',
    header: 'Instrument',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="text-muted-foreground text-xs">
          {row.original.code}
          {row.original.isRsu ? ' - RSU (excluded from portfolio)' : ''}
        </div>
      </div>
    ),
  },
  {
    id: 'positionCounts',
    header: 'Open / Closed',
    cell: ({ row }) => `${row.original.openPositions} / ${row.original.closedPositions}`,
  },
  {
    accessorKey: 'displayCurrency',
    header: 'Currency',
    cell: ({ row }) => row.original.displayCurrency,
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
        {row.original.averageBuyPrice === null
          ? '-'
          : formatByCurrency(row.original.averageBuyPrice, row.original.displayCurrency)}
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
          : formatByCurrency(row.original.currentUnitPrice, row.original.displayCurrency)}
      </div>
    ),
  },
  {
    accessorKey: 'investedAmount',
    header: 'Invested',
    cell: ({ row }) => (
      <div className="text-right">
        {formatByCurrency(row.original.investedAmount, row.original.displayCurrency)}
      </div>
    ),
  },
  {
    accessorKey: 'valuationAmount',
    header: 'Current Value',
    cell: ({ row }) => (
      <div className="text-right">
        {formatByCurrency(row.original.valuationAmount, row.original.displayCurrency)}
      </div>
    ),
  },
  {
    id: 'fxDetails',
    header: 'INR Details',
    cell: ({ row }) => <GroupedFxPopover row={row.original} />,
  },
  {
    accessorKey: 'pnl',
    header: 'P/L',
    cell: ({ row }) => (
      <div className={`text-right ${getSignedValueTone(row.original.pnl)}`}>
        {formatSignedByCurrency(row.original.pnl, row.original.displayCurrency)}
        {row.original.pnlPercentage === null ? '' : ` (${row.original.pnlPercentage.toFixed(2)}%)`}
      </div>
    ),
  },
  {
    accessorKey: 'dayChange',
    header: '1D Change',
    cell: ({ row }) => (
      <div className={`text-right ${getSignedValueTone(row.original.dayChange)}`}>
        {formatSignedByCurrency(row.original.dayChange, row.original.displayCurrency)}
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
        getItemValue={(item) =>
          `${item.kind}:${item.stockMarket ?? 'NA'}:${item.code}:${item.isRsu ? 'RSU' : 'REG'}`
        }
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
