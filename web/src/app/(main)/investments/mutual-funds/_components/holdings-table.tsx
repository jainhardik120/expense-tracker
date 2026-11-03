'use client';

import { useEffect, useMemo, useState } from 'react';

import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import type { ColumnDef } from '@/lib/table';
import { cn } from '@/lib/utils';

import { assetTypeLabel, percent, rupees } from './format';
import {
  type Analysis,
  type Company,
  type Today,
  signedPercent,
  signedRupees,
  toneFor,
} from './today';

type HoldingRow = Company & {
  price: number | null;
  changePercent: number | null;
  impact: number | null;
  fundValue: number | null;
  fundWeight: number | null;
  fundImpact: number | null;
  fundImpactPoints: number | null;
};

type HoldingSort = 'exposure' | 'movers' | 'gainers' | 'losers';

const SORTS: Array<{ key: HoldingSort; label: string }> = [
  { key: 'exposure', label: 'Largest' },
  { key: 'movers', label: "Today's movers" },
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
];

const EQUITY = 'EQUITY';

const PERCENT = 100;
const MIN_NAV_POINTS = 0.0005;
const NAV_POINT_DECIMALS = 3;
const NUMBER_CELL = 'text-right tabular-nums';

const sortRows = (rows: HoldingRow[], sort: HoldingSort, byFund: boolean) => {
  const impactOf = (row: HoldingRow) => (byFund ? row.fundImpact : row.impact);
  if (sort === 'exposure') {
    return byFund
      ? rows.toSorted((left, right) => (right.fundValue ?? 0) - (left.fundValue ?? 0))
      : rows;
  }
  const priced = rows.filter((row) => impactOf(row) !== null);
  if (sort === 'movers') {
    return priced.toSorted(
      (left, right) => Math.abs(impactOf(right) ?? 0) - Math.abs(impactOf(left) ?? 0),
    );
  }
  const direction = sort === 'gainers' ? 1 : -1;
  return priced
    .filter((row) => direction * (impactOf(row) ?? 0) > 0)
    .toSorted((left, right) => direction * ((impactOf(right) ?? 0) - (impactOf(left) ?? 0)));
};

const withFundFigures = (
  row: Omit<HoldingRow, 'fundValue' | 'fundWeight' | 'fundImpact' | 'fundImpactPoints'>,
  selectedFunds: string[],
): HoldingRow => {
  const within = row.funds.filter((fund) => selectedFunds.includes(fund.schemeCode));
  if (within.length === 0) {
    return { ...row, fundValue: null, fundWeight: null, fundImpact: null, fundImpactPoints: null };
  }
  const fundValue = within.reduce((total, fund) => total + fund.value, 0);
  const fundWeight = within.length === 1 ? (within[0]?.weightPercent ?? null) : null;
  const change = row.changePercent;
  return {
    ...row,
    fundValue,
    fundWeight,
    fundImpact: change === null ? null : (fundValue * change) / PERCENT,
    fundImpactPoints:
      change === null || fundWeight === null ? null : (fundWeight * change) / PERCENT,
  };
};

const includesFilter = (value: string, filterValue: unknown) =>
  !Array.isArray(filterValue) || filterValue.length === 0 || filterValue.includes(value);

const optionsFor = (
  rows: HoldingRow[],
  pick: (row: HoldingRow) => string,
  label = (value: string) => value,
) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(pick(row), (counts.get(pick(row)) ?? 0) + 1);
  }
  return [...counts.keys()]
    .toSorted((left, right) => left.localeCompare(right))
    .map((value) => ({ label: label(value), value, count: counts.get(value) ?? 0 }));
};

const sectorOf = (row: HoldingRow) =>
  row.assetType === EQUITY ? row.sector : assetTypeLabel(row.assetType);

const industryOf = (row: HoldingRow) => row.industry ?? '';

const typeOf = (row: HoldingRow) => assetTypeLabel(row.assetType);

const fundCodesOf = (row: HoldingRow) => row.funds.map((fund) => fund.schemeCode).join(',');

const buildColumns = (
  rows: HoldingRow[],
  fundNames: Map<string, string>,
): ColumnDef<HoldingRow>[] => [
  {
    id: 'fund',
    accessorFn: fundCodesOf,
    header: 'Fund',
    filterFn: (row, _columnId, filterValue: unknown) =>
      !Array.isArray(filterValue) ||
      filterValue.length === 0 ||
      row.original.funds.some((fund) => filterValue.includes(fund.schemeCode)),
    meta: {
      label: 'Fund',
      variant: 'multiSelect',
      options: [...fundNames.entries()].map(([value, label]) => ({
        label,
        value,
        count: rows.filter((row) => row.funds.some((fund) => fund.schemeCode === value)).length,
      })),
    },
    enableColumnFilter: true,
  },
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Company',
    cell: ({ row }) => <div className="max-w-64 truncate font-medium">{row.original.name}</div>,
    meta: { label: 'Company', variant: 'text', placeholder: 'Search companies' },
    enableColumnFilter: true,
  },
  {
    id: 'fundValue',
    header: 'In fund',
    cell: ({ row }) => (
      <div className="flex flex-col items-end tabular-nums">
        <span>{row.original.fundValue === null ? '—' : rupees(row.original.fundValue)}</span>
        {row.original.fundWeight === null ? null : (
          <span className="text-muted-foreground text-xs">
            {percent(row.original.fundWeight, 2)} of fund
          </span>
        )}
      </div>
    ),
    meta: { align: 'right' },
  },
  {
    id: 'fundImpact',
    header: 'Fund impact',
    cell: ({ row }) => {
      const { fundImpact, fundImpactPoints } = row.original;
      if (fundImpact === null) {
        return <div className="text-right">—</div>;
      }
      return (
        <div
          className={cn(
            'flex flex-col items-end tabular-nums',
            Math.round(Math.abs(fundImpact)) === 0 ? 'text-muted-foreground' : toneFor(fundImpact),
          )}
        >
          <span>{signedRupees(fundImpact)}</span>
          {fundImpactPoints === null ? null : (
            <span className="text-xs">
              {Math.abs(fundImpactPoints) < MIN_NAV_POINTS
                ? '0.000%'
                : signedPercent(fundImpactPoints, NAV_POINT_DECIMALS)}{' '}
              of NAV
            </span>
          )}
        </div>
      );
    },
    meta: { align: 'right' },
  },
  {
    id: 'assetType',
    accessorFn: typeOf,
    header: 'Type',
    filterFn: (row, _columnId, filterValue: unknown) =>
      includesFilter(typeOf(row.original), filterValue),
    meta: { label: 'Type', variant: 'multiSelect', options: optionsFor(rows, typeOf) },
    enableColumnFilter: true,
  },
  {
    id: 'sector',
    accessorFn: sectorOf,
    header: 'Sector',
    filterFn: (row, _columnId, filterValue: unknown) =>
      includesFilter(sectorOf(row.original), filterValue),
    meta: { label: 'Sector', variant: 'multiSelect', options: optionsFor(rows, sectorOf) },
    enableColumnFilter: true,
  },
  {
    id: 'industry',
    accessorFn: industryOf,
    header: 'Industry',
    cell: ({ row }) => row.original.industry ?? '—',
    filterFn: (row, _columnId, filterValue: unknown) =>
      includesFilter(industryOf(row.original), filterValue),
    meta: {
      label: 'Industry',
      variant: 'multiSelect',
      options: optionsFor(
        rows.filter((row) => row.industry !== null),
        industryOf,
      ),
    },
    enableColumnFilter: true,
  },
  {
    id: 'capBucket',
    accessorKey: 'capBucket',
    header: 'Size',
    filterFn: (row, _columnId, filterValue: unknown) =>
      includesFilter(row.original.capBucket, filterValue),
    meta: {
      label: 'Market cap',
      variant: 'multiSelect',
      options: optionsFor(rows, (row) => row.capBucket),
    },
    enableColumnFilter: true,
  },
  {
    id: 'funds',
    header: 'Funds',
    cell: ({ row }) => <div className={NUMBER_CELL}>{row.original.funds.length}</div>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'value',
    header: 'Your exposure',
    cell: ({ row }) => <div className={NUMBER_CELL}>{rupees(row.original.value)}</div>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'share',
    header: 'Share',
    cell: ({ row }) => <div className={NUMBER_CELL}>{percent(row.original.share, 2)}</div>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'price',
    header: 'Price',
    cell: ({ row }) => (
      <div className={NUMBER_CELL}>
        {row.original.price === null ? '—' : `₹${row.original.price.toLocaleString('en-IN')}`}
      </div>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'changePercent',
    header: 'Today',
    cell: ({ row }) => {
      const change = row.original.changePercent;
      return (
        <div className={cn(NUMBER_CELL, change === null ? '' : toneFor(change))}>
          {change === null ? '—' : signedPercent(change)}
        </div>
      );
    },
    meta: { align: 'right' },
  },
  {
    accessorKey: 'impact',
    header: 'Your impact',
    cell: ({ row }) => {
      const { impact } = row.original;
      return (
        <div className={cn(NUMBER_CELL, impact === null ? '' : toneFor(impact))}>
          {impact === null ? '—' : signedRupees(impact)}
        </div>
      );
    },
    meta: { align: 'right' },
  },
];

const Detail = ({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) => (
  <div className="flex justify-between gap-4 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn(NUMBER_CELL, className)}>{value}</span>
  </div>
);

const HoldingDetails = ({
  row,
  fundNames,
}: {
  row: HoldingRow;
  fundNames: Map<string, string>;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <Detail label="Your exposure" value={rupees(row.value)} />
      <Detail label="Share of your fund money" value={percent(row.share, 2)} />
      <Detail label="Sector" value={row.industry ?? sectorOf(row)} />
      {row.assetType === EQUITY ? <Detail label="Size" value={row.capBucket} /> : null}
      {row.marketCapCrore === null ? null : (
        <Detail
          label="Market cap"
          value={`₹${Math.round(row.marketCapCrore).toLocaleString('en-IN')} crore`}
        />
      )}
      {row.price === null ? null : (
        <Detail label="Price" value={`₹${row.price.toLocaleString('en-IN')}`} />
      )}
      {row.changePercent === null ? null : (
        <Detail
          className={toneFor(row.changePercent)}
          label="Today"
          value={
            row.impact === null
              ? signedPercent(row.changePercent)
              : `${signedPercent(row.changePercent)} · ${signedRupees(row.impact)} for you`
          }
        />
      )}
    </div>
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Held through</span>
      {row.funds.map((fund) => (
        <div key={fund.schemeCode} className="flex justify-between gap-4 text-sm">
          <span className="truncate">{fundNames.get(fund.schemeCode) ?? fund.schemeCode}</span>
          <span className="shrink-0 text-right tabular-nums">
            {rupees(fund.value)}
            <span className="text-muted-foreground ml-2">
              {percent(fund.weightPercent, 2)} of fund
            </span>
          </span>
        </div>
      ))}
    </div>
  </div>
);

export const HoldingsTable = ({
  analysis,
  fundNames,
  today,
}: {
  analysis: Analysis;
  fundNames: Map<string, string>;
  today: Today | null;
}) => {
  const [sort, setSort] = useState<HoldingSort>('exposure');
  const [selected, setSelected] = useState<HoldingRow | null>(null);
  const [fundFilter] = useQueryState('fund', parseAsArrayOf(parseAsString, ','));
  const selectedFunds = useMemo(() => fundFilter ?? [], [fundFilter]);
  const byFund = selectedFunds.length > 0;
  const rows = useMemo(
    () =>
      analysis.companies.map((company) => {
        const quote = today?.quotes.get(company.key);
        return withFundFigures(
          {
            ...company,
            price: quote?.price ?? null,
            changePercent: quote?.dayChangePercent ?? null,
            impact: today?.impactByCompany.get(company.key) ?? null,
          },
          selectedFunds,
        );
      }),
    [analysis.companies, today, selectedFunds],
  );
  const data = useMemo(() => sortRows(rows, sort, byFund), [rows, sort, byFund]);
  const columns = useMemo(() => buildColumns(rows, fundNames), [rows, fundNames]);
  const { table } = useDataTable({
    data,
    columns,
    pageCount: 1,
    manualFiltering: false,
    initialState: { columnVisibility: { fund: false, fundValue: false, fundImpact: false } },
  });
  useEffect(() => {
    table.setColumnVisibility((current) => ({
      ...current,
      fund: false,
      fundValue: byFund,
      fundImpact: byFund,
    }));
  }, [table, byFund]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">What you own underneath</h3>
        <p className="text-muted-foreground text-sm">
          Your money in each fund multiplied by that fund&apos;s weight in each holding, added up
          across funds. Select a row to see which funds hold it.
        </p>
      </div>
      <DataTable
        enablePagination={false}
        getItemValue={(row) => row.key}
        table={table}
        onRowClick={setSelected}
      >
        <DataTableToolbar table={table} viewOptions={false}>
          {today === null ? null : (
            <div className="flex [scrollbar-width:none] gap-1 overflow-x-auto">
              {SORTS.map((item) => (
                <Button
                  key={item.key}
                  className="shrink-0"
                  size="sm"
                  variant={item.key === sort ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setSort(item.key);
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          )}
        </DataTableToolbar>
      </DataTable>
      <Modal
        className="sm:max-w-lg"
        description={
          selected === null ? undefined : `${String(selected.funds.length)} of your funds hold this`
        }
        open={selected !== null}
        setOpen={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        title={selected?.name}
        trigger={<span className="hidden" />}
      >
        {selected === null ? null : <HoldingDetails fundNames={fundNames} row={selected} />}
      </Modal>
    </div>
  );
};
