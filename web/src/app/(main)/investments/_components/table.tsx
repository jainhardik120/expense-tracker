'use client';

import { useCallback, useMemo } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ArrowRight } from 'lucide-react';
import { useQueryStates } from 'nuqs';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { matchesSelection, matchesStatus, toViewValue } from '@/lib/investment-selection';
import {
  investmentCategoryLabels,
  investmentCategoryValues,
  type InvestmentCategoryValue,
  type TimelineFilters,
} from '@/lib/investments';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { investmentParser, MS_PER_MINUTE } from '@/types';

import { createGroupedColumns } from './grouped-columns';
import { createInvestmentColumns } from './investment-columns';
import { CreateInvestmentForm } from './investment-forms';
import { InvestmentsOverview } from './investments-overview';
import { MarketStrip } from './market-strip';

type InvestmentsPageData = RouterOutput['investments']['getInvestmentsInitialData'];

const selectionParsers = {
  category: investmentParser.category,
  instrument: investmentParser.instrument,
  status: investmentParser.status,
  page: investmentParser.page,
  perPage: investmentParser.perPage,
};
const priceSources = [
  'Stocks: Groww for India, Yahoo Finance for US',
  'Mutual funds: Groww',
  'Commodities: Groww and Hindustan Times',
  'Indices: Groww',
  'USD/INR: Yahoo Finance',
];

const getAsOf = (positions: InvestmentsPageData['positions']) => {
  const times = positions.flatMap((position) =>
    position.normalizedKind === 'stocks' &&
    !position.isExcludedFromPortfolioPosition &&
    !position.isClosedPosition &&
    position.valuationDate !== null
      ? [position.valuationDate.getTime()]
      : [],
  );
  return times.length === 0 ? null : new Date(Math.max(...times));
};

const getTotalCharges = (positions: InvestmentsPageData['positions']) =>
  positions.reduce(
    (total, position) =>
      position.isExcludedFromPortfolioPosition ? total : total + (position.charges ?? 0),
    0,
  );

const getPriceStatus = (isError: boolean, isLive: boolean) => {
  if (isError) {
    return 'live prices unavailable, showing last saved';
  }
  return isLive ? 'live' : 'updating…';
};

const Table = ({ data, filters }: { data: InvestmentsPageData; filters: TimelineFilters }) => {
  const router = useRouter();
  const utils = api.useUtils();
  const liveQuery = api.investments.getInvestmentsLive.useQuery(
    { start: filters.start, end: filters.end, investmentKind: filters.investmentKind },
    { refetchInterval: MS_PER_MINUTE },
  );
  const { positions, dashboard } = liveQuery.data ?? data;
  const isLive = liveQuery.data !== undefined;
  const asOf = useMemo(() => getAsOf(positions), [positions]);
  const totalCharges = useMemo(() => getTotalCharges(positions), [positions]);
  const refresh = useCallback(async () => {
    await utils.investments.invalidate();
    router.refresh();
  }, [router, utils]);
  const zoned = useZonedFormat();
  const [selection, setSelection] = useQueryStates(selectionParsers);
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
  const statusOptions = useMemo(() => {
    const closed = positions.filter((position) => position.isClosedPosition).length;
    return [
      { label: 'Open', value: 'open', count: positions.length - closed },
      { label: 'Closed', value: 'closed', count: closed },
    ];
  }, [positions]);
  const columns = useMemo(
    () =>
      createInvestmentColumns(
        () => {
          void refresh();
        },
        zoned,
        { categoryOptions, instrumentOptions, statusOptions },
      ),
    [refresh, zoned, categoryOptions, instrumentOptions, statusOptions],
  );
  const groupedColumns = useMemo(
    () => createGroupedColumns(instrumentOptions, statusOptions, refresh),
    [instrumentOptions, statusOptions, refresh],
  );
  const matchingPositions = useMemo(
    () =>
      positions.filter(
        (position) =>
          matchesSelection(position, selection) &&
          matchesStatus(
            { hasOpen: !position.isClosedPosition, hasClosed: position.isClosedPosition },
            selection,
          ),
      ),
    [positions, selection],
  );
  const visibleInstruments = useMemo(
    () =>
      dashboard.instrumentBreakdown.filter((row) =>
        matchesStatus(
          { hasOpen: row.openPositions > 0, hasClosed: row.closedPositions > 0 },
          selection,
        ),
      ),
    [dashboard.instrumentBreakdown, selection],
  );
  const pageStart = Math.max(selection.page - 1, 0) * selection.perPage;
  const pagePositions = useMemo(
    () => matchingPositions.slice(pageStart, pageStart + selection.perPage),
    [matchingPositions, pageStart, selection.perPage],
  );

  const { table } = useDataTable({
    data: pagePositions,
    columns,
    pageCount: Math.max(1, Math.ceil(matchingPositions.length / selection.perPage)),
    initialState: {
      columnVisibility: {
        category: false,
        instrument: false,
        normalizedKind: false,
        paidAmount: false,
        charges: false,
        rsu: false,
        fxDetails: false,
      },
    },
  });
  const { table: groupedTable } = useDataTable({
    data: visibleInstruments,
    columns: groupedColumns,
    pageCount: 1,
    manualFiltering: false,
    initialState: {
      columnVisibility: {
        instrument: false,
        assetClass: false,
        positionCounts: false,
        status: false,
        fxDetails: false,
      },
    },
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
    <div className="grid grid-cols-1 gap-4">
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href="/investments/mutual-funds">
            Mutual fund analysis
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <MarketStrip />
      <InvestmentsOverview
        asOf={asOf}
        dashboard={dashboard}
        filters={filters}
        isLive={isLive}
        selectedCategories={selectedCategories}
        selection={selection}
        totalCharges={totalCharges}
        onCategoryToggle={toggleCategory}
        onSelect={select}
      />
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs">
        <span>Prices: {getPriceStatus(liveQuery.isError, isLive)}</span>
        {priceSources.map((source) => (
          <span key={source}>{source}</span>
        ))}
        <span>
          Crypto market data provided by{' '}
          <a
            className="underline underline-offset-2"
            href="https://www.coingecko.com/"
            rel="noreferrer"
            target="_blank"
          >
            CoinGecko
          </a>
        </span>
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
        <DataTableToolbar table={groupedTable} />
      </DataTable>
      <DataTable getItemValue={(item) => item.id} table={table}>
        <DataTableToolbar table={table}>
          <CreateInvestmentForm refresh={refresh} />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
};

export default Table;
