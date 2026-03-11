'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Trash } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { investmentKindLabels } from '@/lib/investments';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { CloseInvestmentForm, UpdateInvestmentForm } from './InvestmentForms';

type InvestmentRow = RouterOutput['investments']['getInvestments']['investments'][number];

const formatSignedCurrency = (value: number | null): string => {
  if (value === null) {
    return '-';
  }
  const absValue = Math.abs(value);
  const formatted = formatCurrency(absValue);
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
};

export const createInvestmentColumns = (refresh: () => void): ColumnDef<InvestmentRow>[] => [
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
      if (row.original.instrumentName === null) {
        return code;
      }
      return `${row.original.instrumentName} (${code})`;
    },
  },
  {
    accessorKey: 'investmentDate',
    header: 'Investment Date',
    cell: ({ row }) => format(row.original.investmentDate, 'PP'),
  },
  {
    accessorKey: 'investmentAmount',
    header: 'Invested',
    cell: ({ row }) => formatCurrency(row.original.investmentAmount),
  },
  {
    accessorKey: 'units',
    header: 'Units',
    cell: ({ row }) => row.original.units ?? '-',
  },
  {
    accessorKey: 'liveUnitPrice',
    header: 'Unit Price (INR)',
    cell: ({ row }) =>
      row.original.liveUnitPrice === null ? '-' : formatCurrency(row.original.liveUnitPrice),
  },
  {
    accessorKey: 'valuationAmount',
    header: 'Current Value',
    cell: ({ row }) =>
      row.original.valuationAmount === null ? '-' : formatCurrency(row.original.valuationAmount),
  },
  {
    accessorKey: 'pnl',
    header: 'P/L',
    cell: ({ row }) => {
      const pnlValue = row.original.pnl;
      const pnlPercent = row.original.pnlPercentage;
      if (pnlValue === null) {
        return <span>-</span>;
      }
      let tone = 'text-muted-foreground';
      if (pnlValue > 0) {
        tone = 'text-green-600';
      } else if (pnlValue < 0) {
        tone = 'text-red-600';
      }
      const percentage = pnlPercent === null ? '' : ` (${pnlPercent.toFixed(2)}%)`;
      return <span className={tone}>{`${formatSignedCurrency(pnlValue)}${percentage}`}</span>;
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
        <div className="flex items-center gap-2">
          <UpdateInvestmentForm
            initialData={row.original}
            investmentId={row.original.id}
            refresh={refresh}
          />
          {!row.original.isClosedPosition ? (
            <CloseInvestmentForm investmentId={row.original.id} refresh={refresh} />
          ) : null}
          <DeleteConfirmationDialog
            mutation={deleteMutation}
            mutationInput={{ id: row.original.id }}
            refresh={() => {
              refresh();
            }}
          >
            <Button className="size-8" size="icon" variant="ghost">
              <Trash />
            </Button>
          </DeleteConfirmationDialog>
        </div>
      );
    },
  },
];
