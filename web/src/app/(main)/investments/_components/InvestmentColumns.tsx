'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { CircleOff, Info, SquarePen, Trash } from 'lucide-react';

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
import { FX_RATE_DECIMALS, investmentKindLabels } from '@/lib/investments';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { CloseInvestmentForm, UpdateInvestmentForm } from './InvestmentForms';

type InvestmentRow =
  RouterOutput['investments']['getInvestmentsInitialData']['table']['investments'][number];

const USD_CURRENCY = 'USD';
const INR_CURRENCY = 'INR';

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

export const createInvestmentColumns = (
  refresh: () => void,
  zoned: ZonedFormat,
): ColumnDef<InvestmentRow>[] => [
  {
    accessorKey: 'normalizedKind',
    header: 'Type',
    cell: ({ row }) => investmentKindLabels[row.original.normalizedKind],
  },
  {
    accessorKey: 'instrumentCode',
    header: 'Code',
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
    header: 'Tag',
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
    accessorKey: 'investmentDate',
    header: 'Investment Date',
    cell: ({ row }) => zoned(row.original.investmentDate, DATE_FORMAT.date),
  },
  {
    accessorKey: 'investmentAmount',
    header: 'Invested',
    cell: ({ row }) =>
      formatCurrency(row.original.investedAmountDisplay, row.original.displayCurrency),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'units',
    header: 'Units',
    cell: ({ row }) => row.original.units ?? '-',
    meta: { align: 'right' },
  },
  {
    accessorKey: 'liveUnitPrice',
    header: 'Unit Price',
    cell: ({ row }) => {
      if (row.original.liveUnitPriceDisplay === null) {
        return '-';
      }
      return formatCurrency(row.original.liveUnitPriceDisplay, row.original.displayCurrency);
    },
    meta: { align: 'right' },
  },
  {
    accessorKey: 'valuationAmount',
    header: 'Current Value',
    cell: ({ row }) =>
      row.original.valuationAmountDisplay === null
        ? '-'
        : formatCurrency(row.original.valuationAmountDisplay, row.original.displayCurrency),
    meta: { align: 'right' },
  },
  {
    id: 'fxDetails',
    header: 'INR Details',
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
    meta: { align: 'right' },
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
    meta: { align: 'right' },
  },
  {
    id: 'status',
    header: 'Status',
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
