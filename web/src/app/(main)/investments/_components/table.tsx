'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { type ColumnDef } from '@tanstack/react-table';
import { Info } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import {
  compareInvestmentCategories,
  getInvestmentCategory,
  investmentCategoryLabels,
  investmentCategoryValues,
  investmentKindLabels,
  investmentKindValues,
  type InvestmentCategoryValue,
  type InvestmentKindValue,
} from '@/lib/investments';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { getExcludedPortfolioDescription } from './display';
import { createInvestmentColumns, getSignedValueTone } from './InvestmentColumns';
import { CreateInvestmentForm } from './InvestmentForms';
import { InvestmentsOverview } from './InvestmentsOverview';

type InvestmentsPageData = RouterOutput['investments']['getInvestmentsInitialData'];
type MarketDataResult = RouterOutput['investments']['getInvestmentsMarketDataByType'];
type TimelineFilters = {
  start?: Date;
  end?: Date;
  investmentKind: string[];
};
const UNITS_DECIMALS = 4;
type GroupedInvestmentRow = InvestmentsPageData['dashboard']['instrumentBreakdown'][number];
const USD_CURRENCY = 'USD';
const INR_CURRENCY = 'INR';
const LOCAL_CALCULATION_SOURCE = 'local calculation';

const marketDataSources: Record<InvestmentKindValue, string> = {
  fd: LOCAL_CALCULATION_SOURCE,
  stocks: 'Yahoo Finance',
  mutual_funds: 'MFAPI',
  crypto: 'CoinGecko',
  commodities: 'Upstox and Hindustan Times',
  epfo: LOCAL_CALCULATION_SOURCE,
  other: LOCAL_CALCULATION_SOURCE,
};

const getMarketDataStatus = (query: { isError: boolean; isSuccess: boolean }): string => {
  if (query.isError) {
    return 'unavailable';
  }
  if (query.isSuccess) {
    return 'updated';
  }
  return 'updating…';
};

const mergeDashboard = (
  initialDashboard: InvestmentsPageData['dashboard'],
  marketData: MarketDataResult[],
) => {
  const updatedKinds = new Map(
    marketData.flatMap((data) => data.dashboard.kindBreakdown.map((item) => [item.kind, item])),
  );
  const kindBreakdown = initialDashboard.kindBreakdown.map(
    (item) => updatedKinds.get(item.kind) ?? item,
  );
  const updatedCategories = new Map(
    marketData.flatMap((data) =>
      data.dashboard.categoryBreakdown.map((item) => [item.category, item]),
    ),
  );
  const categoryBreakdown = initialDashboard.categoryBreakdown.map(
    (item) => updatedCategories.get(item.category) ?? item,
  );
  const updatedKindValues = new Set(
    marketData.flatMap((data) =>
      data.table.investments.map((investment) => investment.normalizedKind),
    ),
  );
  const instrumentBreakdown = [
    ...initialDashboard.instrumentBreakdown.filter((item) => !updatedKindValues.has(item.kind)),
    ...marketData.flatMap((data) => data.dashboard.instrumentBreakdown),
  ].sort((left, right) => {
    const categoryComparison = compareInvestmentCategories(
      getInvestmentCategory(left.kind, left.isRsu),
      getInvestmentCategory(right.kind, right.isRsu),
    );
    return categoryComparison === 0 ? left.name.localeCompare(right.name) : categoryComparison;
  });
  const instrumentOptions = [
    ...initialDashboard.instrumentOptions.filter((item) => !updatedKindValues.has(item.kind)),
    ...marketData.flatMap((data) => data.dashboard.instrumentOptions),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const summary = kindBreakdown.reduce(
    (total, item) => ({
      investedAmount: total.investedAmount + item.investedAmount,
      valuationAmount: total.valuationAmount + item.valuationAmount,
      dayChange: total.dayChange + item.dayChange,
      openPositions: total.openPositions + item.openPositions,
      closedPositions: total.closedPositions + item.closedPositions,
      totalPositions: total.totalPositions + item.totalPositions,
    }),
    {
      investedAmount: 0,
      valuationAmount: 0,
      dayChange: 0,
      openPositions: 0,
      closedPositions: 0,
      totalPositions: 0,
    },
  );
  const pnl = summary.valuationAmount - summary.investedAmount;
  const timeline =
    marketData.length === investmentKindValues.length
      ? [
          ...marketData
            .flatMap((data) => data.dashboard.timeline)
            .reduce((points, point) => {
              const key = point.date.toISOString();
              const existing = points.get(key) ?? {
                date: point.date,
                investedAmount: 0,
                valuationAmount: 0,
                pnl: 0,
              };
              existing.investedAmount += point.investedAmount;
              existing.valuationAmount += point.valuationAmount;
              existing.pnl += point.pnl;
              points.set(key, existing);
              return points;
            }, new Map<string, InvestmentsPageData['dashboard']['timeline'][number]>())
            .values(),
        ]
      : initialDashboard.timeline;

  return {
    ...initialDashboard,
    summary: {
      ...summary,
      pnl,
      pnlPercentage: summary.investedAmount === 0 ? null : (pnl / summary.investedAmount) * 100,
      dayChangePercentage:
        summary.valuationAmount === summary.dayChange
          ? null
          : (summary.dayChange / (summary.valuationAmount - summary.dayChange)) * 100,
    },
    kindBreakdown,
    categoryBreakdown,
    instrumentBreakdown,
    instrumentOptions,
    timeline,
  };
};

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
    id: 'category',
    accessorFn: (row) => getInvestmentCategory(row.kind, row.isRsu),
    header: 'Type',
    cell: ({ row }) =>
      investmentCategoryLabels[getInvestmentCategory(row.original.kind, row.original.isRsu)],
    filterFn: (row, _columnId, filterValue: unknown) => {
      if (!Array.isArray(filterValue) || filterValue.length === 0) {
        return true;
      }
      return filterValue.includes(getInvestmentCategory(row.original.kind, row.original.isRsu));
    },
    meta: {
      label: 'Investment Category',
      variant: 'multiSelect',
      options: investmentCategoryValues.map((category) => ({
        label: investmentCategoryLabels[category],
        value: category,
      })),
    },
    enableColumnFilter: true,
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
          {getExcludedPortfolioDescription(row.original).replace(' totals', '')}
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
  const marketDataInput = {
    start: filters.start,
    end: filters.end,
    investmentKind: filters.investmentKind,
  };
  const fixedDepositQuery = api.investments.getInvestmentsMarketDataByType.useQuery({
    ...marketDataInput,
    investmentType: 'fd',
  });
  const stocksQuery = api.investments.getInvestmentsMarketDataByType.useQuery({
    ...marketDataInput,
    investmentType: 'stocks',
  });
  const mutualFundsQuery = api.investments.getInvestmentsMarketDataByType.useQuery({
    ...marketDataInput,
    investmentType: 'mutual_funds',
  });
  const cryptoQuery = api.investments.getInvestmentsMarketDataByType.useQuery({
    ...marketDataInput,
    investmentType: 'crypto',
  });
  const commoditiesQuery = api.investments.getInvestmentsMarketDataByType.useQuery({
    ...marketDataInput,
    investmentType: 'commodities',
  });
  const epfoQuery = api.investments.getInvestmentsMarketDataByType.useQuery({
    ...marketDataInput,
    investmentType: 'epfo',
  });
  const otherQuery = api.investments.getInvestmentsMarketDataByType.useQuery({
    ...marketDataInput,
    investmentType: 'other',
  });
  const marketQueries = [
    ['fd', fixedDepositQuery],
    ['stocks', stocksQuery],
    ['mutual_funds', mutualFundsQuery],
    ['crypto', cryptoQuery],
    ['commodities', commoditiesQuery],
    ['epfo', epfoQuery],
    ['other', otherQuery],
  ] as const;
  const marketData = useMemo(
    () => marketQueries.flatMap(([, query]) => (query.data === undefined ? [] : [query.data])),
    // Each query result is an explicit dependency; the tuple itself is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      fixedDepositQuery.data,
      stocksQuery.data,
      mutualFundsQuery.data,
      cryptoQuery.data,
      commoditiesQuery.data,
      epfoQuery.data,
      otherQuery.data,
    ],
  );
  const enrichedById = useMemo(
    () =>
      new Map(
        marketData.flatMap((result) => result.table.investments.map((item) => [item.id, item])),
      ),
    [marketData],
  );
  const tableData = useMemo(
    () => data.table.investments.map((item) => enrichedById.get(item.id) ?? item),
    [data.table.investments, enrichedById],
  );
  const dashboard = useMemo(
    () => mergeDashboard(data.dashboard, marketData),
    [data.dashboard, marketData],
  );
  const columns = createInvestmentColumns(() => {
    router.refresh();
  });

  const { table } = useDataTable({
    data: tableData,
    columns,
    pageCount: data.table.pageCount,
    shallow: false,
  });
  const { table: groupedTable } = useDataTable({
    data: dashboard.instrumentBreakdown,
    columns: groupedInvestmentColumns,
    pageCount: 1,
    manualFiltering: false,
  });
  const selectedCategoryFilter = groupedTable.getColumn('category')?.getFilterValue();
  const selectedCategories = new Set<InvestmentCategoryValue>(
    Array.isArray(selectedCategoryFilter)
      ? selectedCategoryFilter.filter((category): category is InvestmentCategoryValue =>
          investmentCategoryValues.includes(category as InvestmentCategoryValue),
        )
      : [],
  );
  const toggleCategory = (category: InvestmentCategoryValue) => {
    const nextCategories = new Set(selectedCategories);
    if (nextCategories.has(category)) {
      nextCategories.delete(category);
    } else {
      nextCategories.add(category);
    }
    groupedTable
      .getColumn('category')
      ?.setFilterValue(nextCategories.size === 0 ? undefined : [...nextCategories]);
  };

  return (
    <div className="grid gap-4">
      <InvestmentsOverview
        dashboard={dashboard}
        filters={filters}
        instrumentTimelines={data.instrumentTimelines}
        selectedCategories={selectedCategories}
        onCategoryToggle={toggleCategory}
      />
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs">
        {marketQueries.map(([kind, query]) => (
          <span key={kind}>
            {investmentKindLabels[kind]} ({marketDataSources[kind]}): {getMarketDataStatus(query)}
          </span>
        ))}
      </div>
      <DataTable
        enablePagination={false}
        getItemValue={(item) =>
          `${item.kind}:${item.stockMarket ?? 'NA'}:${item.code}:${item.isRsu ? 'RSU' : 'REG'}`
        }
        table={groupedTable}
      >
        <DataTableToolbar table={groupedTable} viewOptions={false} />
      </DataTable>
      <DataTable getItemValue={(item) => item.id} table={table}>
        <DataTableToolbar table={table}>
          <CreateInvestmentForm />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
};

export default Table;
