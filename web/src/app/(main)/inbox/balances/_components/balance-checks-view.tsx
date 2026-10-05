'use client';

import { useRouter } from 'next/navigation';

import { Plus, SquarePen, Trash } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Button } from '@/components/ui/button';
import { ZonedDate } from '@/components/zoned-date';
import { useDataTable } from '@/hooks/use-data-table';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import {
  type CheckAccount,
  CreateBalanceCheckForm,
  UpdateBalanceCheckForm,
} from './balance-check-form';

type AccountChecks = RouterOutput['balanceChecks']['getOverview'][number];

const differenceClassName = (value: number) =>
  value === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

const DeleteCheck = ({ id }: { id: string }) => {
  const router = useRouter();
  const mutation = api.balanceChecks.deleteCheck.useMutation();
  return (
    <DeleteConfirmationDialog
      description="The check is removed. Your statements are not changed."
      mutation={mutation}
      mutationInput={{ id }}
      refresh={router.refresh}
      successToast={() => 'Balance check removed'}
    >
      <RowActionTrigger destructive icon={Trash} label="Delete" />
    </DeleteConfirmationDialog>
  );
};

type CheckRow = AccountChecks['checks'][number] & {
  accountId: string;
  accountName: string;
  isCreditCard: boolean;
};

const checkColumns = (accounts: CheckAccount[]): Array<ColumnDef<CheckRow>> => [
  {
    id: 'checkedAt',
    header: 'When',
    cell: ({ row }) => <ZonedDate pattern={DATE_FORMAT.dateTime} value={row.original.checkedAt} />,
    enableHiding: false,
  },
  {
    id: 'account',
    header: 'Account',
    cell: ({ row }) => <span className="font-medium">{row.original.accountName}</span>,
    meta: { label: 'Account' },
  },
  {
    id: 'balance',
    header: 'Bank balance',
    cell: ({ row }) => formatCurrency(row.original.balance),
    meta: { align: 'right', label: 'Bank balance' },
  },
  {
    id: 'computed',
    header: 'App balance',
    cell: ({ row }) => formatCurrency(row.original.computed),
    meta: { align: 'right', label: 'App balance' },
  },
  {
    id: 'difference',
    header: 'Difference',
    cell: ({ row }) => (
      <span
        className={cn(
          'font-medium',
          differenceClassName(row.original.matches ? 0 : row.original.difference),
        )}
      >
        {row.original.matches ? 'Matches' : formatCurrency(row.original.difference)}
      </span>
    ),
    meta: { align: 'right', label: 'Difference' },
  },
  {
    id: 'unexplained',
    header: 'Since previous check',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.unexplainedSincePrevious === 0
          ? '-'
          : formatCurrency(row.original.unexplainedSincePrevious)}
      </span>
    ),
    meta: { align: 'right', label: 'Since previous check' },
  },
  {
    id: 'note',
    header: 'Note',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.note ??
          (row.original.source === 'statement_import' ? 'From a statement' : '')}
      </span>
    ),
    meta: { label: 'Note' },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <RowActions>
        <UpdateBalanceCheckForm
          accounts={accounts}
          check={row.original}
          trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
        />
        <DeleteCheck id={row.original.id} />
      </RowActions>
    ),
    enableHiding: false,
  },
];

const BalanceChecksView = ({ overview }: { overview: AccountChecks[] }) => {
  const accounts: CheckAccount[] = overview.map((account) => ({
    accountId: account.accountId,
    accountName: account.accountName,
    isCreditCard: account.isCreditCard,
  }));
  const rows: CheckRow[] = overview
    .flatMap((account) =>
      account.checks.map((check) => ({
        ...check,
        accountId: account.accountId,
        accountName: account.accountName,
        isCreditCard: account.isCreditCard,
      })),
    )
    .toSorted((left, right) => right.checkedAt.getTime() - left.checkedAt.getTime());
  const { table } = useDataTable({
    data: rows,
    columns: checkColumns(accounts),
    pageCount: -1,
  });
  return (
    <DataTable enablePagination={false} getItemValue={(item) => item.id} table={table}>
      <DataTableToolbar table={table}>
        <CreateBalanceCheckForm
          accounts={accounts}
          trigger={
            <Button className="h-8">
              <Plus className="size-4" />
              Add balance check
            </Button>
          }
        />
      </DataTableToolbar>
    </DataTable>
  );
};

export default BalanceChecksView;
