'use client';

import { Info, Plus, SquarePen } from 'lucide-react';

import { type RowMenuAction } from '@/components/data-table/row-context-menu';
import { type DialogControl } from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatCurrency, formatSignedCurrency, formatPercent, formatNumber } from '@/lib/format';
import { toViewValue } from '@/lib/investment-selection';
import {
  assetClassLabels,
  canTagAssetClass,
  getAssetClass,
  getInvestmentCategory,
  investmentCategoryLabels,
  investmentCategoryValues,
  FX_RATE_DECIMALS,
  normalizeStockMarket,
} from '@/lib/investments';
import type { ColumnDef } from '@/lib/table';
import { type RouterOutput } from '@/server/routers';

import { getSignedValueTone } from './investment-columns';
import { AssetClassForm, CreateInvestmentForm } from './investment-forms';

type GroupedInvestmentRow =
  RouterOutput['investments']['getInvestmentsInitialData']['dashboard']['instrumentBreakdown'][number];

type FilterOption = { label: string; value: string; count: number };

const USD_CURRENCY = 'USD';
const INR_CURRENCY = 'INR';
const UNITS_DECIMALS = 4;

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

export const createGroupedColumns = (
  instrumentOptions: FilterOption[],
  statusOptions: FilterOption[],
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
    meta: { label: 'Instrument' },
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
      </div>
    ),
  },
  {
    id: 'assetClass',
    accessorFn: (row) => assetClassLabels[getAssetClass(row.kind, row.code, row.assetClass)],
    header: 'Asset class',
    meta: { label: 'Asset class' },
  },
  {
    id: 'positionCounts',
    accessorFn: (row) => row.openPositions,
    header: 'Open / Closed',
    meta: { label: 'Open / Closed' },
    cell: ({ row }) => `${row.original.openPositions} / ${row.original.closedPositions}`,
  },
  {
    accessorKey: 'units',
    header: 'Units Held',
    cell: ({ row }) => (
      <div className="text-right">{formatNumber(row.original.units, UNITS_DECIMALS)}</div>
    ),
    meta: { align: 'right', label: 'Units Held' },
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
    meta: { align: 'right', label: 'Avg Buy Price' },
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
    meta: { align: 'right', label: 'Current Unit Price' },
  },
  {
    accessorKey: 'investedAmount',
    header: 'Invested',
    cell: ({ row }) => (
      <div className="text-right">
        {formatCurrency(row.original.investedAmount, row.original.displayCurrency)}
      </div>
    ),
    meta: { align: 'right', label: 'Invested' },
  },
  {
    accessorKey: 'valuationAmount',
    header: 'Current Value',
    cell: ({ row }) => (
      <div className="text-right">
        {formatCurrency(row.original.valuationAmount, row.original.displayCurrency)}
      </div>
    ),
    meta: { align: 'right', label: 'Current Value' },
  },
  {
    id: 'fxDetails',
    accessorFn: (row) => row.displayCurrency,
    enableSorting: false,
    header: 'INR Details',
    meta: { label: 'INR Details' },
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
    meta: { align: 'right', label: 'P/L' },
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
    meta: { align: 'right', label: '1D Change' },
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
    meta: { align: 'right', label: 'XIRR' },
  },
  {
    id: 'instrument',
    accessorFn: (row) => toViewValue(row.kind, row.code, row.stockMarket),
    enableHiding: false,
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
  {
    id: 'status',
    accessorFn: (row) => (row.openPositions > 0 ? 'open' : 'closed'),
    enableHiding: false,
    header: 'Status',
    filterFn: () => true,
    meta: { label: 'Status', variant: 'multiSelect', options: statusOptions },
    enableColumnFilter: true,
  },
];

export const groupedRowActions = (
  row: GroupedInvestmentRow,
  refresh: () => Promise<void>,
): RowMenuAction[] => [
  {
    key: 'new',
    label: 'New investment',
    icon: Plus,
    dialog: (dialog) => (
      <CreateInvestmentForm
        dialog={dialog}
        prefill={{
          investmentKind: row.kind,
          instrumentCode: row.code,
          stockMarket: normalizeStockMarket(row.stockMarket),
          isRsu: row.isRsu,
        }}
        refresh={refresh}
      />
    ),
  },
  ...(canTagAssetClass(row.kind) && !row.isRsu
    ? [
        {
          key: 'asset-class',
          label: 'Edit asset class',
          icon: SquarePen,
          dialog: (dialog: DialogControl) => (
            <AssetClassForm
              assetClass={row.assetClass}
              code={row.code}
              dialog={dialog}
              kind={row.kind}
              name={row.name}
              refresh={refresh}
            />
          ),
        },
      ]
    : []),
];
