'use client';

import { useMemo } from 'react';

import { Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useDataTable } from '@/hooks/use-data-table';
import type { ColumnDef } from '@/lib/table';
import { api } from '@/server/react';

import { type InterestAccount, showDay, toIsoDay } from './interest-format';

type InterestRate = InterestAccount['rates'][number];

const MAX_RATE = 100;

const rateSchema = z.object({
  effectiveFrom: z.date(),
  annualRate: z
    .string()
    .trim()
    .refine((value) => value !== '' && Number(value) >= 0 && Number(value) < MAX_RATE, {
      message: 'Enter a rate between 0 and 100',
    }),
});

type RateForm = z.infer<typeof rateSchema>;

const rateFields: FormField<RateForm>[] = [
  { name: 'effectiveFrom', label: 'Effective from', type: 'date' },
  { name: 'annualRate', label: 'Rate (% a year)', type: 'number', placeholder: '2.5' },
];

const createRateColumns = (
  deleteRate: ReturnType<typeof api.accounts.interest.deleteRate.useMutation>,
  onSaved: () => void,
): ColumnDef<InterestRate>[] => [
  {
    id: 'from',
    accessorFn: (rate) => rate.effectiveFrom,
    header: 'Effective from',
    cell: ({ row }) => <span className="font-medium">{showDay(row.original.effectiveFrom)}</span>,
  },
  {
    id: 'rate',
    accessorFn: (rate) => rate.annualRate,
    header: 'Rate',
    cell: ({ row }) => <span className="tabular-nums">{row.original.annualRate}%</span>,
    meta: { align: 'right' },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DeleteConfirmationDialog
          mutation={deleteRate}
          mutationInput={{ id: row.original.id }}
          refresh={onSaved}
        >
          <Button aria-label="Delete rate" size="icon" variant="ghost">
            <Trash2 />
          </Button>
        </DeleteConfirmationDialog>
      </div>
    ),
  },
];

const AddRateButton = ({ accountId, onSaved }: { accountId: string; onSaved: () => void }) => {
  const mutation = api.accounts.interest.saveRate.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          <Plus /> Rate
        </Button>
      }
      defaultValues={{ effectiveFrom: new Date(), annualRate: '' }}
      fields={rateFields}
      mapInput={(values: RateForm) => ({
        accountId,
        effectiveFrom: toIsoDay(values.effectiveFrom),
        annualRate: values.annualRate,
      })}
      modalDescription="The savings rate the bank pays from this date. Add a new row whenever it changes."
      mutation={mutation}
      refresh={onSaved}
      schema={rateSchema}
      submitButtonText="Save rate"
      successToast={() => 'Rate saved'}
      titleText="Interest rate"
    />
  );
};

export const InterestRates = ({
  account,
  onSaved,
}: {
  account: InterestAccount;
  onSaved: () => void;
}) => {
  const deleteRate = api.accounts.interest.deleteRate.useMutation();
  const columns = useMemo(() => createRateColumns(deleteRate, onSaved), [deleteRate, onSaved]);
  const { table } = useDataTable({ data: account.rates, columns, pageCount: -1 });

  return (
    <>
      <Separator />
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Rates</h3>
        <AddRateButton accountId={account.accountId} onSaved={onSaved} />
      </div>
      {account.rates.length === 0 ? (
        <p className="text-muted-foreground text-sm">No rates yet, so nothing can be expected.</p>
      ) : (
        <DataTable
          background={false}
          enablePagination={false}
          getItemValue={(rate) => rate.id}
          showBorder={false}
          table={table}
        />
      )}
    </>
  );
};
