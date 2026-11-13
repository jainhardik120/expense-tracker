'use client';

import { useMemo, useState } from 'react';

import { Check, Landmark, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import { RowActions } from '@/components/data-table/row-actions';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import Modal from '@/components/modal';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { cn, errorMessage } from '@/lib/utils';
import { api } from '@/server/react';

import {
  fromIsoDay,
  type InterestAccount,
  type InterestRow,
  showDay,
  showPeriod,
  toIsoDay,
} from './interest-format';
import { InterestRates } from './interest-rates';

const MATERIAL_DIFFERENCE = 1;

const roundedExpected = (row: InterestRow) =>
  row.expected === null ? null : Math.round(row.expected);

const statusLine = (row: InterestRow) => {
  switch (row.status) {
    case 'credited':
      return { text: `Credited ${showDay(row.creditedOn ?? row.period.end)}`, tone: '' };
    case 'unconfirmed':
      return {
        text: `Credited ${showDay(row.creditedOn ?? row.period.end)} · quarter guessed`,
        tone: 'text-amber-700 dark:text-amber-300',
      };
    case 'missing':
      return { text: 'No credit found', tone: 'text-destructive' };
    case 'due':
      return { text: 'Credit due soon', tone: '' };
    case 'current':
      return {
        text: `In progress · ${formatCurrency(Math.round(row.accrued ?? 0))} so far`,
        tone: '',
      };
  }
};

const periodSchema = z
  .object({ start: z.date(), end: z.date() })
  .refine((value) => value.start <= value.end, {
    message: 'The quarter must end after it starts',
    path: ['end'],
  });

type PeriodForm = z.infer<typeof periodSchema>;

const periodFields: FormField<PeriodForm>[] = [
  { name: 'start', label: 'Quarter starts', type: 'date' },
  { name: 'end', label: 'Quarter ends', type: 'date' },
];

const SetPeriodButton = ({ row, onSaved }: { row: InterestRow; onSaved: () => void }) => {
  const mutation = api.accounts.interest.setPeriods.useMutation();
  return (
    <MutationModal
      button={
        <Button aria-label="Set quarter" size="icon" title="Set quarter" variant="ghost">
          <Pencil />
        </Button>
      }
      defaultValues={{ start: fromIsoDay(row.period.start), end: fromIsoDay(row.period.end) }}
      fields={periodFields}
      mapInput={(values: PeriodForm) => ({
        entries: [
          {
            statementId: row.statementId ?? '',
            period: { start: toIsoDay(values.start), end: toIsoDay(values.end) },
          },
        ],
      })}
      modalDescription="The days this credit pays interest for, as printed by the bank."
      mutation={mutation}
      refresh={onSaved}
      schema={periodSchema}
      submitButtonText="Save quarter"
      successToast={() => 'Quarter saved'}
      titleText="Interest quarter"
    />
  );
};

const ConfirmPeriodButton = ({ row, onSaved }: { row: InterestRow; onSaved: () => void }) => {
  const mutation = api.accounts.interest.setPeriods.useMutation();
  return (
    <Button
      aria-label="Confirm quarter"
      disabled={mutation.isPending}
      size="icon"
      title="Confirm guessed quarter"
      variant="ghost"
      onClick={() => {
        mutation
          .mutateAsync({ entries: [{ statementId: row.statementId ?? '', period: row.period }] })
          .then(onSaved)
          .catch((error: unknown) => toast.error(errorMessage(error)));
      }}
    >
      <Check />
    </Button>
  );
};

const TaxableToggle = ({ row, onSaved }: { row: InterestRow; onSaved: () => void }) => {
  const mutation = api.statements.updateTaxableIncome.useMutation();
  return (
    <div className="flex justify-center">
      <Checkbox
        aria-label="Taxable income"
        checked={row.taxableAmount !== null}
        disabled={mutation.isPending}
        onCheckedChange={(checked) => {
          mutation
            .mutateAsync({
              statementId: row.statementId ?? '',
              taxableAmount: checked === true ? String(row.actual ?? 0) : null,
            })
            .then(onSaved)
            .catch((error: unknown) => toast.error(errorMessage(error)));
        }}
      />
    </div>
  );
};

const createRowColumns = (onSaved: () => void): ColumnDef<InterestRow>[] => [
  {
    id: 'quarter',
    accessorFn: (row) => row.period.start,
    header: 'Quarter',
    cell: ({ row }) => {
      const status = statusLine(row.original);
      return (
        <div>
          <p className="font-medium">{showPeriod(row.original.period)}</p>
          <p className={cn('text-muted-foreground text-xs', status.tone)}>{status.text}</p>
        </div>
      );
    },
  },
  {
    id: 'expected',
    accessorFn: (row) => row.expected,
    header: 'Expected',
    cell: ({ row }) => {
      const expected = roundedExpected(row.original);
      return (
        <div>
          {expected === null ? (
            <p className="text-muted-foreground text-xs">Add a rate</p>
          ) : (
            <p className="tabular-nums">{formatCurrency(expected)}</p>
          )}
          {row.original.averageBalance === null ? null : (
            <p className="text-muted-foreground text-xs tabular-nums">
              avg {formatCurrency(Math.round(row.original.averageBalance))}
            </p>
          )}
        </div>
      );
    },
    meta: { align: 'right' },
  },
  {
    id: 'credited',
    accessorFn: (row) => row.actual,
    header: 'Credited',
    cell: ({ row }) => {
      if (row.original.actual === null) {
        return <span className="text-muted-foreground">—</span>;
      }
      const expected = roundedExpected(row.original);
      const difference = expected === null ? 0 : row.original.actual - expected;
      return (
        <div>
          <p className="font-medium tabular-nums">{formatCurrency(row.original.actual)}</p>
          {Math.abs(difference) < MATERIAL_DIFFERENCE ? null : (
            <p className="text-xs text-amber-700 tabular-nums dark:text-amber-300">
              {formatSignedCurrency(difference)}
            </p>
          )}
        </div>
      );
    },
    meta: { align: 'right' },
  },
  {
    id: 'taxable',
    header: 'Taxable',
    cell: ({ row }) =>
      row.original.statementId === null ? null : (
        <TaxableToggle row={row.original} onSaved={onSaved} />
      ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) =>
      row.original.statementId === null ? null : (
        <RowActions>
          {row.original.status === 'unconfirmed' ? (
            <ConfirmPeriodButton key="confirm" row={row.original} onSaved={onSaved} />
          ) : null}
          <SetPeriodButton key="edit" row={row.original} onSaved={onSaved} />
        </RowActions>
      ),
  },
];

const AccountInterest = ({
  account,
  onSaved,
}: {
  account: InterestAccount;
  onSaved: () => void;
}) => {
  const confirmAll = api.accounts.interest.setPeriods.useMutation();
  const rowColumns = useMemo(() => createRowColumns(onSaved), [onSaved]);
  const { table: rowTable } = useDataTable({
    data: account.rows,
    columns: rowColumns,
    pageCount: -1,
  });
  const guessed = account.rows.filter((row) => row.status === 'unconfirmed');
  const missing = account.rows.filter((row) => row.status === 'missing');

  return (
    <div className="space-y-4">
      {guessed.length === 0 ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {guessed.length} {guessed.length === 1 ? 'credit has' : 'credits have'} a guessed
            quarter.
          </span>
          <Button
            disabled={confirmAll.isPending}
            size="sm"
            variant="outline"
            onClick={() => {
              confirmAll
                .mutateAsync({
                  entries: guessed.map((row) => ({
                    statementId: row.statementId ?? '',
                    period: row.period,
                  })),
                })
                .then(onSaved)
                .catch((error: unknown) => toast.error(errorMessage(error)));
            }}
          >
            <Check /> Confirm all
          </Button>
        </div>
      )}
      {missing.length === 0 ? null : (
        <p className="text-destructive text-sm">
          {missing.length} {missing.length === 1 ? 'quarter has' : 'quarters have'} no interest
          credit.
        </p>
      )}
      {account.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No interest credits on this account yet. Tag a credit as Interest to start tracking it.
        </p>
      ) : (
        <DataTable
          background={false}
          enablePagination={false}
          getItemValue={(row) => row.key}
          showBorder={false}
          table={rowTable}
        />
      )}
      <InterestRates account={account} onSaved={onSaved} />
    </div>
  );
};

export const BankInterestDialog = ({ onChanged }: { onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: accounts = [], refetch } = api.accounts.interest.getOverview.useQuery(undefined, {
    enabled: open,
  });
  const defaultAccount =
    accounts.find((account) => account.rows.length > 0) ?? accounts.at(0) ?? null;
  const account = accounts.find((entry) => entry.accountId === selected) ?? defaultAccount;
  const onSaved = useMemo(
    () => () => {
      void refetch();
      onChanged();
    },
    [refetch, onChanged],
  );

  return (
    <Modal
      className="sm:max-w-4xl"
      description="Interest expected from your daily balances, next to what each bank credited."
      open={open}
      setOpen={setOpen}
      title="Bank interest"
      trigger={
        <Button size="sm" variant="outline">
          <Landmark /> Bank interest
        </Button>
      }
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        <Select
          value={account?.accountId ?? ''}
          onValueChange={(value) => {
            setSelected(value);
          }}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Choose an account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((entry) => (
              <SelectItem key={entry.accountId} value={entry.accountId}>
                {entry.accountName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {account === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <AccountInterest key={account.accountId} account={account} onSaved={onSaved} />
        )}
      </div>
    </Modal>
  );
};
