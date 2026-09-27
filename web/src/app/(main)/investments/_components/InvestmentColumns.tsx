'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { CircleOff, Info, SquarePen, Trash } from 'lucide-react';

import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type ZonedFormat } from '@/hooks/use-zoned-format';
import { formatCurrency } from '@/lib/format';
import { FX_RATE_DECIMALS, investmentKindLabels } from '@/lib/investments';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { CloseInvestmentForm, UpdateInvestmentForm } from './InvestmentForms';

type InvestmentRow =
  RouterOutput['investments']['getInvestmentsPageData']['table']['investments'][number];

const USD_CURRENCY = 'USD';
const INR_CURRENCY = 'INR';

export const formatSignedCurrency = (value: number | null): string => {
  if (value === null) {
    return '-';
  }
  const absValue = Math.abs(value);
  const formatted = formatCurrency(absValue, INR_CURRENCY, 'en-IN');
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
};

export const getSignedValueTone = (value: number | null): string => {
  if (value === null || value === 0) {
    return 'text-muted-foreground';
  }
  return value > 0 ? 'text-green-600' : 'text-red-600';
};

const formatByCurrency = (amount: number, currency: string): string => {
  const locale = currency === USD_CURRENCY ? 'en-US' : 'en-IN';
  return formatCurrency(amount, currency, locale);
};

const formatSignedByCurrency = (value: number | null, currency: string): string => {
  if (value === null) {
    return '-';
  }
  const absValue = Math.abs(value);
  const formatted = formatByCurrency(absValue, currency);
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
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
          <div>Buy value (USD): {formatByCurrency(row.investedAmountDisplay, USD_CURRENCY)}</div>
          <div>
            Buy value (INR @ purchase-date FX): {formatByCurrency(buyValueInr, INR_CURRENCY)}
          </div>
          <div>
            Current value (USD):{' '}
            {row.valuationAmountDisplay === null
              ? '-'
              : formatByCurrency(row.valuationAmountDisplay, USD_CURRENCY)}
          </div>
          <div>
            Current value (INR @ today FX):{' '}
            {currentValueInr === null ? '-' : formatByCurrency(currentValueInr, INR_CURRENCY)}
          </div>
          <div>Purchase FX: {buyFxRate === null ? '-' : buyFxRate.toFixed(FX_RATE_DECIMALS)}</div>
          <div>
            Today FX: {currentFxRate === null ? '-' : currentFxRate.toFixed(FX_RATE_DECIMALS)}
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
    cell: ({ row }) => zoned(row.original.investmentDate, 'PP'),
  },
  {
    accessorKey: 'investmentAmount',
    header: 'Invested',
    cell: ({ row }) =>
      formatByCurrency(row.original.investedAmountDisplay, row.original.displayCurrency),
  },
  {
    accessorKey: 'units',
    header: 'Units',
    cell: ({ row }) => row.original.units ?? '-',
  },
  {
    accessorKey: 'liveUnitPrice',
    header: 'Unit Price',
    cell: ({ row }) => {
      if (row.original.liveUnitPriceDisplay === null) {
        return '-';
      }
      return formatByCurrency(row.original.liveUnitPriceDisplay, row.original.displayCurrency);
    },
  },
  {
    accessorKey: 'valuationAmount',
    header: 'Current Value',
    cell: ({ row }) =>
      row.original.valuationAmountDisplay === null
        ? '-'
        : formatByCurrency(row.original.valuationAmountDisplay, row.original.displayCurrency),
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
      const percentage = pnlPercent === null ? '' : ` (${pnlPercent.toFixed(2)}%)`;
      return (
        <span className={tone}>
          {`${formatSignedByCurrency(pnlValue, row.original.displayCurrency)}${percentage}`}
        </span>
      );
    },
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
      const percentage = dayChangePercent === null ? '' : ` (${dayChangePercent.toFixed(2)}%)`;
      return (
        <span className={getSignedValueTone(dayChangeValue)}>
          {`${formatSignedByCurrency(dayChangeValue, row.original.displayCurrency)}${percentage}`}
        </span>
      );
    },
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
