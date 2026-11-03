'use client';

import { useMemo } from 'react';

import { parseAsArrayOf, parseAsInteger, parseAsString, useQueryStates } from 'nuqs';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ArrowRight, Info } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDataTable } from '@/hooks/use-data-table';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { formatCurrency, formatSignedCurrency, formatPercent, formatNumber } from '@/lib/format';
import {
  compareInvestmentCategories,
  getInvestmentCategory,
  investmentCategoryLabels,
  investmentCategoryValues,
  investmentKindLabels,
  investmentKindValues,
  type InvestmentCategoryValue,
  type InvestmentKindValue,
  FX_RATE_DECIMALS,
  mergeTimelines,
  type TimelineFilters,
} from '@/lib/investments';
import { toViewValue } from '@/lib/investment-selection';
import type { ColumnDef } from '@/lib/table';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { PERCENTAGE_DIVISOR } from '@/types';

import { createInvestmentColumns, getSignedValueTone } from './investment-columns';
import { CreateInvestmentForm } from './investment-forms';
import { InvestmentsOverview } from './investments-overview';

type InvestmentsPageData = RouterOutput['investments']['getInvestmentsInitialData'];
type MarketDataResult = RouterOutput['investments']['getInvestmentsMarketDataByType'];
const UNITS_DECIMALS = 4;
type GroupedInvestmentRow = InvestmentsPageData['dashboard']['instrumentBreakdown'][number];
const USD_CURRENCY = 'USD';

type FilterOption = { label: string; value: string; count: number };

const selectionParsers = {
  category: parseAsArrayOf(parseAsString, ',').withDefault([]),
  instrument: parseAsArrayOf(parseAsString, ',').withDefault([]),
  page: parseAsInteger,
};
const INR_CURRENCY = 'INR';
const LOCAL_CALCULATION_SOURCE = 'local calculation';

const marketDataSources: Record<InvestmentKindValue, string> = {
  fd: LOCAL_CALCULATION_SOURCE,
  stocks: 'Groww for India, Yahoo Finance for US',
  mutual_funds: 'Groww',
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
  portfolioXirr: number | null,
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
      ? mergeTimelines(marketData.flatMap((data) => data.dashboard.timeline))
      : initialDashboard.timeline;

  return {
    ...initialDashboard,
    summary: {
      ...summary,
      pnl,
      pnlPercentage:
        summary.investedAmount === 0 ? null : (pnl / summary.investedAmount) * PERCENTAGE_DIVISOR,
      dayChangePercentage:
        summary.valuationAmount === summary.dayChange
          ? null
          : (summary.dayChange / (summary.valuationAmount - summary.dayChange)) *
            PERCENTAGE_DIVISOR,
      xirr: portfolioXirr,
    },
    kindBreakdown,
    categoryBreakdown,
    instrumentBreakdown,
    instrumentOptions,
    timeline,
  };
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
          <div>Buy value (USD): {formatCurrency(row.investedAmount, USD_CURRENCY)}</div>
          <div>
            Buy value (INR @ purchase-date FX):{' '}
            {row.buyValueInrAtPurchaseFx === null
              ? '-'
              : formatCurrency(row.buyValueInrAtPurchaseFx, INR_CURRENCY)}
          </div>
          <div>Current value (USD): {formatCurrency(row.valuationAmount, USD_CURRENCY)}</div>
          <div>
            Current value (INR @ today FX):{' '}
            {row.currentValueInrAtCurrentFx === null
              ? '-'
              : formatCurrency(row.currentValueInrAtCurrentFx, INR_CURRENCY)}
          </div>
          <div>
            Purchase FX:{' '}
            {row.buyFxRateToInr === null ? '-' : formatNumber(row.buyFxRateToInr, FX_RATE_DECIMALS)}
          </div>
          <div>
            Today FX:{' '}
            {row.currentFxRateToInr === null
              ? '-'
              : formatNumber(row.currentFxRateToInr, FX_RATE_DECIMALS)}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const createGroupedColumns = (
  instrumentOptions: FilterOption[],
): ColumnDef<GroupedInvestmentRow>[] => [
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
    accessorKey: 'name',
    header: 'Instrument',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
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
      <div className="text-right">{formatNumber(row.original.units, UNITS_DECIMALS)}</div>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'averageBuyPrice',
    header: 'Avg Buy Price',
    cell: ({ row }) => (
      <div className="text-right">
        {row.original.averageBuyPrice === null
          ? '-'
          : formatCurrency(row.original.averageBuyPrice, row.original.displayCurrency)}
      </div>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'currentUnitPrice',
    header: 'Current Unit Price',
    cell: ({ row }) => (
      <div className="text-right">
        {row.original.currentUnitPrice === null
          ? '-'
          : formatCurrency(row.original.currentUnitPrice, row.original.displayCurrency)}
      </div>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'investedAmount',
    header: 'Invested',
    cell: ({ row }) => (
      <div className="text-right">
        {formatCurrency(row.original.investedAmount, row.original.displayCurrency)}
      </div>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'valuationAmount',
    header: 'Current Value',
    cell: ({ row }) => (
      <div className="text-right">
        {formatCurrency(row.original.valuationAmount, row.original.displayCurrency)}
      </div>
    ),
    meta: { align: 'right' },
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
        {formatSignedCurrency(row.original.pnl, row.original.displayCurrency)}
        {row.original.pnlPercentage === null
          ? ''
          : ` (${formatPercent(row.original.pnlPercentage)})`}
      </div>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'dayChange',
    header: '1D Change',
    cell: ({ row }) => (
      <div className={`text-right ${getSignedValueTone(row.original.dayChange)}`}>
        {formatSignedCurrency(row.original.dayChange, row.original.displayCurrency)}
        {row.original.dayChangePercentage === null
          ? ''
          : ` (${formatPercent(row.original.dayChangePercentage)})`}
      </div>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'xirr',
    header: 'XIRR',
    cell: ({ row }) => (
      <div
        className={`text-right ${row.original.xirr === null ? '' : getSignedValueTone(row.original.xirr)}`}
      >
        {row.original.xirr === null ? '-' : formatPercent(row.original.xirr)}
      </div>
    ),
    meta: { align: 'right' },
  },
  {
    id: 'instrument',
    accessorFn: (row) => toViewValue(row.kind, row.code, row.stockMarket),
    header: 'Investment',
    filterFn: (row, _columnId, filterValue: unknown) =>
      !Array.isArray(filterValue) ||
      filterValue.length === 0 ||
      filterValue.includes(
        toViewValue(row.original.kind, row.original.code, row.original.stockMarket),
      ),
    meta: { label: 'Investment', variant: 'multiSelect', options: instrumentOptions },
    enableColumnFilter: true,
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
  const overviewQuery = api.investments.getOverview.useQuery();
  const portfolioXirr = overviewQuery.data?.summary.xirr ?? null;
  const dashboard = useMemo(
    () => mergeDashboard(data.dashboard, marketData, portfolioXirr),
    [data.dashboard, marketData, portfolioXirr],
  );
  const zoned = useZonedFormat();
  const categoryTimelines = useMemo(() => {
    const updatedTimelines = new Map(
      marketData.flatMap((result) =>
        result.categoryTimelines.map((entry) => [entry.category, entry]),
      ),
    );
    return data.categoryTimelines.map((entry) => updatedTimelines.get(entry.category) ?? entry);
  }, [data.categoryTimelines, marketData]);
  const [selection, setSelection] = useQueryStates(selectionParsers, { shallow: false });
  const instrumentOptions = useMemo(
    () =>
      dashboard.instrumentBreakdown.map((row) => ({
        label: row.name === row.code ? row.name : `${row.name} (${row.code})`,
        value: toViewValue(row.kind, row.code, row.stockMarket),
        count: row.positionsCount,
      })),
    [dashboard.instrumentBreakdown],
  );
  const categoryOptions = useMemo(
    () =>
      dashboard.categoryBreakdown.map((row) => ({
        label: investmentCategoryLabels[row.category],
        value: row.category,
        count: row.totalPositions,
      })),
    [dashboard.categoryBreakdown],
  );
  const columns = useMemo(
    () =>
      createInvestmentColumns(
        () => {
          router.refresh();
        },
        zoned,
        { categoryOptions, instrumentOptions },
      ),
    [router, zoned, categoryOptions, instrumentOptions],
  );
  const groupedColumns = useMemo(
    () => createGroupedColumns(instrumentOptions),
    [instrumentOptions],
  );

  const { table } = useDataTable({
    data: tableData,
    columns,
    pageCount: data.table.pageCount,
    shallow: false,
    initialState: { columnVisibility: { category: false, instrument: false } },
  });
  const { table: groupedTable } = useDataTable({
    data: dashboard.instrumentBreakdown,
    columns: groupedColumns,
    pageCount: 1,
    manualFiltering: false,
    shallow: false,
    initialState: { columnVisibility: { instrument: false } },
  });
  const selectedCategories = new Set<InvestmentCategoryValue>(
    selection.category.filter((category): category is InvestmentCategoryValue =>
      investmentCategoryValues.includes(category as InvestmentCategoryValue),
    ),
  );
  const select = (next: { category?: string[]; instrument?: string[] }) => {
    void setSelection({
      category: next.category ?? selection.category,
      instrument: next.instrument ?? selection.instrument,
      page: null,
    });
  };
  const toggleCategory = (category: InvestmentCategoryValue) => {
    const nextCategories = new Set(selectedCategories);
    if (nextCategories.has(category)) {
      nextCategories.delete(category);
    } else {
      nextCategories.add(category);
    }
    select({ category: [...nextCategories], instrument: [] });
  };

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href="/investments/mutual-funds">
            Mutual fund analysis
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <InvestmentsOverview
        categoryTimelines={categoryTimelines}
        dashboard={dashboard}
        filters={filters}
        instrumentTimelines={data.instrumentTimelines}
        selectedCategories={selectedCategories}
        selection={selection}
        onCategoryToggle={toggleCategory}
        onSelect={select}
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
        onRowClick={(row) => {
          const value = toViewValue(row.kind, row.code, row.stockMarket);
          const alreadyOnly =
            selection.instrument.length === 1 && selection.instrument[0] === value;
          select({ instrument: alreadyOnly ? [] : [value] });
        }}
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
