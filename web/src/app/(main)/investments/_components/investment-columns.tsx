'use client';

import { CircleOff, Info, ReceiptIndianRupee, SquarePen, Trash } from 'lucide-react';

import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type ZonedFormat } from '@/hooks/use-zoned-format';
import {
  formatCurrency,
  formatSignedCurrency,
  DATE_FORMAT,
  formatPercent,
  formatNumber,
} from '@/lib/format';
import { toViewValue } from '@/lib/investment-selection';
import { FX_RATE_DECIMALS, getInvestmentCategory, investmentKindLabels } from '@/lib/investments';
import type { ColumnDef } from '@/lib/table';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { PERCENTAGE_DIVISOR } from '@/types';

import { CloseInvestmentForm, UpdateInvestmentForm } from './investment-forms';
import { InvestmentPaymentsDialog } from './investment-payments-dialog';

type InvestmentRow =
  RouterOutput['investments']['getInvestmentsInitialData']['table']['investments'][number];

const getBuyPrice = (row: InvestmentRow) => {
  const units = Number(row.units);
  return units > 0 ? row.investedAmountDisplay / units : null;
};

const USD_CURRENCY = 'USD';
const INR_CURRENCY = 'INR';
const CHARGES_PERCENT_DECIMALS = 3;

export const getSignedValueTone = (value: number | null): string => {
  if (value === null || value === 0) {
    return 'text-muted-foreground';
  }
  return value > 0 ? 'text-green-600' : 'text-red-600';
};

const CurrencyDetailsPopover = ({ row }: { row: InvestmentRow }) => {
  if (row.displayCurrency !== USD_CURRENCY) {
    return <span>-</span>;
  }

  const buyValueInr = row.investedAmountInr;
  const currentValueInr = row.currentValueInrAtCurrentFx;
  const buyFxRate = row.investedAmountFxRateToInr;
  const currentFxRate = row.currentFxRateToInr ?? row.liveFxRateToInr;

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
          <div>Buy value (USD): {formatCurrency(row.investedAmountDisplay, USD_CURRENCY)}</div>
          <div>Buy value (INR @ purchase-date FX): {formatCurrency(buyValueInr, INR_CURRENCY)}</div>
          <div>
            Current value (USD):{' '}
            {row.valuationAmountDisplay === null
              ? '-'
              : formatCurrency(row.valuationAmountDisplay, USD_CURRENCY)}
          </div>
          <div>
            Current value (INR @ today FX):{' '}
            {currentValueInr === null ? '-' : formatCurrency(currentValueInr, INR_CURRENCY)}
          </div>
          <div>
            Purchase FX: {buyFxRate === null ? '-' : formatNumber(buyFxRate, FX_RATE_DECIMALS)}
          </div>
          <div>
            Today FX: {currentFxRate === null ? '-' : formatNumber(currentFxRate, FX_RATE_DECIMALS)}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

type FilterOption = { label: string; value: string; count: number };

export const createInvestmentColumns = (
  refresh: () => void,
  zoned: ZonedFormat,
  filters: { categoryOptions: FilterOption[]; instrumentOptions: FilterOption[] },
): ColumnDef<InvestmentRow>[] => [
  {
    id: 'category',
    accessorFn: (row) => getInvestmentCategory(row.normalizedKind, row.isRsuPosition),
    header: 'Category',
    meta: { label: 'Category', variant: 'multiSelect', options: filters.categoryOptions },
    enableColumnFilter: true,
  },
  {
    id: 'instrument',
    accessorFn: (row) =>
      toViewValue(row.normalizedKind, row.instrumentCode?.trim() ?? '', row.normalizedStockMarket),
    header: 'Investment',
    meta: { label: 'Investment', variant: 'multiSelect', options: filters.instrumentOptions },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'investmentDate',
    header: 'Investment Date',
    meta: { label: 'Investment Date' },
    cell: ({ row }) => zoned(row.original.investmentDate, DATE_FORMAT.date),
  },
  {
    accessorKey: 'normalizedKind',
    header: 'Type',
    meta: { label: 'Type' },
    cell: ({ row }) => investmentKindLabels[row.original.normalizedKind],
  },
  {
    accessorKey: 'instrumentCode',
    header: 'Code',
    meta: { label: 'Code' },
    cell: ({ row }) => {
      const code = row.original.instrumentCode ?? '-';
      const marketSuffix =
        row.original.normalizedKind === 'stocks' && row.original.normalizedStockMarket !== null
          ? ` [${row.original.normalizedStockMarket}]`
          : '';
      if (row.original.instrumentName === null) {
        return `${code}${marketSuffix}`;
      }
      return `${row.original.instrumentName} (${code})${marketSuffix}`;
    },
  },
  {
    id: 'rsu',
    accessorFn: (row) => row.isRsuPosition,
    enableSorting: false,
    header: 'Tag',
    meta: { label: 'Tag' },
    cell: ({ row }) => {
      if (row.original.isRsuPosition) {
        return <Badge variant="secondary">RSU</Badge>;
      }
      if (row.original.normalizedKind === 'epfo') {
        return <Badge variant="secondary">EPFO</Badge>;
      }
      return <span>-</span>;
    },
  },
  {
    accessorKey: 'units',
    header: 'Units',
    cell: ({ row }) => row.original.units ?? '-',
    meta: { align: 'right', label: 'Units' },
  },
  {
    id: 'averageBuyPrice',
    accessorFn: getBuyPrice,
    header: 'Avg Buy Price',
    cell: ({ row }) => {
      const buyPrice = getBuyPrice(row.original);
      return buyPrice === null ? '-' : formatCurrency(buyPrice, row.original.displayCurrency);
    },
    meta: { align: 'right', label: 'Avg Buy Price' },
  },
  {
    accessorKey: 'liveUnitPrice',
    header: 'Current Unit Price',
    cell: ({ row }) => {
      if (row.original.liveUnitPriceDisplay === null) {
        return '-';
      }
      return formatCurrency(row.original.liveUnitPriceDisplay, row.original.displayCurrency);
    },
    meta: { align: 'right', label: 'Current Unit Price' },
  },
  {
    accessorKey: 'investmentAmount',
    header: 'Invested',
    cell: ({ row }) =>
      formatCurrency(row.original.investedAmountDisplay, row.original.displayCurrency),
    meta: { align: 'right', label: 'Invested' },
  },
  {
    accessorKey: 'paidAmount',
    header: 'Paid',
    cell: ({ row }) =>
      row.original.paidAmount === null ? '-' : formatCurrency(row.original.paidAmount),
    meta: { align: 'right', label: 'Paid' },
  },
  {
    accessorKey: 'charges',
    header: 'Charges',
    cell: ({ row }) => {
      const { charges, investedAmountInr } = row.original;
      if (charges === null) {
        return <span>-</span>;
      }
      const percentage =
        investedAmountInr === 0 ? null : (charges / investedAmountInr) * PERCENTAGE_DIVISOR;
      return (
        <span className={charges > 0 ? 'text-red-600' : 'text-muted-foreground'}>
          {formatCurrency(charges)}
          {percentage === null ? '' : ` (${formatPercent(percentage, CHARGES_PERCENT_DECIMALS)})`}
        </span>
      );
    },
    meta: { align: 'right', label: 'Charges' },
  },
  {
    accessorKey: 'valuationAmount',
    header: 'Current Value',
    cell: ({ row }) =>
      row.original.valuationAmountDisplay === null
        ? '-'
        : formatCurrency(row.original.valuationAmountDisplay, row.original.displayCurrency),
    meta: { align: 'right', label: 'Current Value' },
  },
  {
    id: 'fxDetails',
    accessorFn: (row) => row.displayCurrency,
    enableSorting: false,
    header: 'INR Details',
    meta: { label: 'INR Details' },
    cell: ({ row }) => <CurrencyDetailsPopover row={row.original} />,
  },
  {
    accessorKey: 'pnl',
    header: 'P/L',
    cell: ({ row }) => {
      const pnlValue = row.original.pnlDisplay;
      const pnlPercent = row.original.pnlPercentage;
      if (pnlValue === null) {
        return <span>-</span>;
      }
      const tone = getSignedValueTone(pnlValue);
      const percentage = pnlPercent === null ? '' : ` (${formatPercent(pnlPercent)})`;
      return (
        <span className={tone}>
          {`${formatSignedCurrency(pnlValue, row.original.displayCurrency)}${percentage}`}
        </span>
      );
    },
    meta: { align: 'right', label: 'P/L' },
  },
  {
    accessorKey: 'dayChange',
    header: '1D Change',
    cell: ({ row }) => {
      const dayChangeValue = row.original.dayChangeDisplay;
      const dayChangePercent = row.original.dayChangePercentage;
      if (dayChangeValue === null) {
        return <span>-</span>;
      }
      const percentage = dayChangePercent === null ? '' : ` (${formatPercent(dayChangePercent)})`;
      return (
        <span className={getSignedValueTone(dayChangeValue)}>
          {`${formatSignedCurrency(dayChangeValue, row.original.displayCurrency)}${percentage}`}
        </span>
      );
    },
    meta: { align: 'right', label: '1D Change' },
  },
  {
    id: 'status',
    header: 'Status',
    meta: { label: 'Status' },
    cell: ({ row }) => (
      <Badge variant={row.original.isClosedPosition ? 'secondary' : 'default'}>
        {row.original.isClosedPosition ? 'Closed' : 'Open'}
      </Badge>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const deleteMutation = api.investments.deleteInvestment.useMutation();

      return (
        <RowActions>
          <InvestmentPaymentsDialog
            investmentId={row.original.id}
            title={`Payments · ${row.original.instrumentName ?? row.original.instrumentCode ?? investmentKindLabels[row.original.normalizedKind]}`}
            trigger={<RowActionTrigger icon={ReceiptIndianRupee} label="Payments" />}
            onChanged={refresh}
          />
          <UpdateInvestmentForm
            initialData={row.original}
            investmentId={row.original.id}
            refresh={refresh}
            trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
          />
          {row.original.isClosedPosition ? null : (
            <CloseInvestmentForm
              investmentId={row.original.id}
              refresh={refresh}
              trigger={<RowActionTrigger icon={CircleOff} label="Close position" />}
            />
          )}
          <DeleteConfirmationDialog
            mutation={deleteMutation}
            mutationInput={{ id: row.original.id }}
            refresh={() => {
              refresh();
            }}
          >
            <RowActionTrigger destructive icon={Trash} label="Delete" />
          </DeleteConfirmationDialog>
        </RowActions>
      );
    },
  },
];
