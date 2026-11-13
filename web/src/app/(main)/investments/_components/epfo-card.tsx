'use client';

import { useMemo } from 'react';

import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useDataTable } from '@/hooks/use-data-table';
import { getEpfoAnnualRate, getEpfoCreditDate } from '@/lib/epfo';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import { formatFinancialYearLabel, getFinancialYearStart } from '@/lib/salary';
import type { ColumnDef } from '@/lib/table';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { amount } from '@/types';

type EpfoSummary = RouterOutput['investments']['getEpfoSummary'];
type PendingCredit = EpfoSummary['pending'][number];
type Refresh = () => Promise<void> | void;

const MAX_AMOUNT = 9999999999;
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;

const formatMonth = (date: Date) => formatInTimeZone(date, 'UTC', DATE_FORMAT.month);

const creditSchema = z.object({ creditedOn: z.date(), amount });

const creditFields: FormField<z.input<typeof creditSchema>>[] = [
  { name: 'creditedOn', label: 'Credited on', type: 'datetime' },
  { name: 'amount', label: 'Credited amount (INR)', type: 'number', min: 0, max: MAX_AMOUNT },
];

const MarkCreditedButton = ({ credit, refresh }: { credit: PendingCredit; refresh: Refresh }) => {
  const mutation = api.investments.markEpfoCredited.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          Mark credited
        </Button>
      }
      defaultValues={{
        creditedOn: getEpfoCreditDate(credit.dueMonth),
        amount: String(credit.expectedAmount),
      }}
      fields={creditFields}
      mapInput={(values) => ({ salaryPaymentId: credit.salaryPaymentId, ...values })}
      modalDescription={`${formatMonth(credit.periodStart)} salary, due ${formatMonth(credit.dueMonth)}`}
      mutation={mutation}
      refresh={refresh}
      schema={creditSchema}
      successToast={() => 'EPFO credit recorded'}
      titleText="Mark EPFO credited"
    />
  );
};

const interestSchema = z.object({
  financialYearStart: z.coerce.number().int().min(YEAR_MIN).max(YEAR_MAX),
  amount,
});

const interestFields: FormField<z.input<typeof interestSchema>>[] = [
  {
    name: 'financialYearStart',
    label: 'Financial year starting',
    type: 'number',
    min: YEAR_MIN,
    max: YEAR_MAX,
  },
  { name: 'amount', label: 'Interest credited (INR)', type: 'number', min: 0, max: MAX_AMOUNT },
];

const RecordInterestButton = ({ refresh }: { refresh: Refresh }) => {
  const mutation = api.investments.saveEpfoInterest.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          Record interest
        </Button>
      }
      defaultValues={{
        financialYearStart: getFinancialYearStart(new Date()) - 1,
        amount: '',
      }}
      fields={interestFields}
      mutation={mutation}
      refresh={refresh}
      schema={interestSchema}
      successToast={() => 'EPFO interest recorded'}
      titleText="Record EPFO interest"
    />
  );
};

type InterestYear = EpfoSummary['interestYears'][number];

const createPendingColumns = (refresh: Refresh): ColumnDef<PendingCredit>[] => [
  {
    id: 'salary',
    accessorFn: (credit) => credit.periodStart,
    header: 'Salary month',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{formatMonth(row.original.periodStart)}</p>
        <p className="text-muted-foreground text-xs">Due {formatMonth(row.original.dueMonth)}</p>
      </div>
    ),
  },
  {
    id: 'expected',
    accessorFn: (credit) => credit.expectedAmount,
    header: 'Expected',
    cell: ({ row }) => formatCurrency(row.original.expectedAmount),
    meta: { align: 'right' },
  },
  {
    id: 'interest',
    accessorFn: (credit) => credit.estimatedInterest,
    header: 'Interest, est.',
    cell: ({ row }) => formatCurrency(row.original.estimatedInterest),
    meta: { align: 'right' },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div className="flex justify-end">
        <MarkCreditedButton credit={row.original} refresh={refresh} />
      </div>
    ),
  },
];

const interestColumns: ColumnDef<InterestYear>[] = [
  {
    id: 'year',
    accessorFn: (year) => year.financialYearStart,
    header: 'Financial year',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{formatFinancialYearLabel(row.original.financialYearStart)}</p>
        <p className="text-muted-foreground text-xs">
          {getEpfoAnnualRate(row.original.financialYearStart)}% a year
        </p>
      </div>
    ),
  },
  {
    id: 'amount',
    accessorFn: (year) => year.amount,
    header: 'Interest',
    cell: ({ row }) => (
      <div>
        <p>{formatCurrency(row.original.amount)}</p>
        <p className="text-muted-foreground text-xs">
          {row.original.isCredited ? 'Credited' : 'Estimated'}
        </p>
      </div>
    ),
    meta: { align: 'right' },
  },
];

const PendingCreditsCard = ({ data, refresh }: { data: EpfoSummary; refresh: Refresh }) => {
  const columns = useMemo(() => createPendingColumns(refresh), [refresh]);
  const { table } = useDataTable({ data: data.pending, columns, pageCount: -1 });
  const monthsLabel = data.pending.length === 1 ? '1 month' : `${data.pending.length} months`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>EPFO credits</CardTitle>
        <CardDescription>
          {data.pending.length === 0
            ? 'Every salary month with PF has a credit.'
            : `${monthsLabel} pending: ${formatCurrency(data.pendingAmount)}, plus ${formatCurrency(data.pendingInterest)} estimated interest as of today.`}
        </CardDescription>
      </CardHeader>
      {data.pending.length === 0 ? null : (
        <CardContent>
          <DataTable
            background={false}
            enablePagination={false}
            getItemValue={(credit) => credit.salaryPaymentId}
            showBorder={false}
            table={table}
          />
        </CardContent>
      )}
    </Card>
  );
};

const InterestCard = ({ data, refresh }: { data: EpfoSummary; refresh: Refresh }) => {
  const { table } = useDataTable({
    data: data.interestYears,
    columns: interestColumns,
    pageCount: -1,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>EPFO interest</CardTitle>
        <CardAction>
          <RecordInterestButton refresh={refresh} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.interestYears.length === 0 ? (
          <p className="text-muted-foreground text-sm">No interest yet.</p>
        ) : (
          <DataTable
            background={false}
            enablePagination={false}
            getItemValue={(year) => String(year.financialYearStart)}
            showBorder={false}
            table={table}
          />
        )}
      </CardContent>
    </Card>
  );
};

export const EpfoCard = ({ refresh }: { refresh: Refresh }) => {
  const { data } = api.investments.getEpfoSummary.useQuery();
  if (data === undefined) {
    return null;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PendingCreditsCard data={data} refresh={refresh} />
      <InterestCard data={data} refresh={refresh} />
    </div>
  );
};
