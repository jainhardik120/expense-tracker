'use client';

import { useMemo } from 'react';

import { type ColumnDef } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency, formatDate } from '@/lib/format';
import { api } from '@/server/react';

import { BonusDialog } from './salary-dialogs';
import { type SalaryData } from './shared';

type Bonus = SalaryData['bonuses'][number];

const createBonusColumns = (
  deleteBonus: ReturnType<typeof api.salary.deleteBonus.useMutation>,
  refresh: () => void,
): ColumnDef<Bonus>[] => [
  {
    id: 'bonus',
    accessorFn: (bonus) => bonus.componentName,
    header: 'Bonus',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.componentName}</p>
        <p className="text-muted-foreground text-xs">
          {formatDate(row.original.expectedDate)} ·{' '}
          {row.original.actualAmount === null ? 'estimate' : 'reconciled'}
        </p>
      </div>
    ),
  },
  {
    id: 'total',
    accessorFn: (bonus) => Number(bonus.actualAmount ?? bonus.estimatedAmount),
    header: 'Total',
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {formatCurrency(row.original.actualAmount ?? row.original.estimatedAmount)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    id: 'net',
    accessorFn: (bonus) => bonus.estimatedNet,
    header: 'Net',
    cell: ({ row }) =>
      row.original.estimatedNet === null ? (
        <span className="text-muted-foreground text-xs">In payroll</span>
      ) : (
        <span className="tabular-nums">{formatCurrency(row.original.estimatedNet)}</span>
      ),
    meta: { align: 'right' },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DeleteConfirmationDialog
          mutation={deleteBonus}
          mutationInput={{ id: row.original.id }}
          refresh={refresh}
        >
          <Button aria-label={`Delete ${row.original.componentName}`} size="icon" variant="ghost">
            <Trash2 />
          </Button>
        </DeleteConfirmationDialog>
      </div>
    ),
  },
];

export const BonusesCard = ({ data, refresh }: { data: SalaryData; refresh: () => void }) => {
  const deleteBonus = api.salary.deleteBonus.useMutation();
  const columns = useMemo(() => createBonusColumns(deleteBonus, refresh), [deleteBonus, refresh]);
  const { table } = useDataTable({ data: data.bonuses, columns, pageCount: -1 });
  const pending = data.bonuses.reduce(
    (totals, bonus) =>
      bonus.estimatedTax === null || bonus.estimatedNet === null
        ? totals
        : {
            gross: totals.gross + Number(bonus.actualAmount ?? bonus.estimatedAmount),
            tax: totals.tax + bonus.estimatedTax,
            net: totals.net + bonus.estimatedNet,
            count: totals.count + 1,
          },
    { gross: 0, tax: 0, net: 0, count: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>One-time bonuses</CardTitle>
        <CardAction>
          <BonusDialog components={data.components} onSaved={refresh} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.bonuses.length === 0 ? (
          <p className="text-muted-foreground text-sm">No bonuses planned.</p>
        ) : (
          <DataTable
            background={false}
            enablePagination={false}
            getItemValue={(bonus) => bonus.id}
            showBorder={false}
            table={table}
          />
        )}
        {pending.count === 0 ? null : (
          <p className="text-muted-foreground text-sm">
            Pending estimates: {formatCurrency(pending.gross)} gross · {formatCurrency(pending.tax)}{' '}
            tax · {formatCurrency(pending.net)} net
          </p>
        )}
      </CardContent>
    </Card>
  );
};
