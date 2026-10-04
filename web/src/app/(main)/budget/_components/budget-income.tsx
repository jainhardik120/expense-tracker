'use client';

import { useOptimistic, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Pencil, Trash } from 'lucide-react';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { describeRule } from '@/lib/budget-rules';
import { formatCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { api } from '@/server/react';
import { budgetIncomeLineSchema, emptyBudgetRule } from '@/types/budget';
import type { YearDetail } from '@/types/router-outputs';

import { BUDGET_COLUMN_SIZE, dragHandleColumn, POSITION_INDENT } from './columns';

import { BudgetIncomeHelp } from '../_help/budget-income-help';

type IncomeLine = YearDetail['incomeLines'][number];

const OPENING_ROW_ID = '__opening_balance__';

const NO_LINE = 'none';

type IncomeRow =
  | { kind: 'opening'; id: typeof OPENING_ROW_ID; amount: number; destinationLineId: string | null }
  | ({ kind: 'line' } & IncomeLine);

const PAYROLL_CLAIM: Record<string, string> = {
  pending_salary: 'pay still to come, from the salary schedule',
  pending_bonus: 'bonuses still to come, from the salary schedule',
};

const describeClaims = (row: IncomeRow): string => {
  if (row.kind === 'opening') {
    return 'whatever last year closed with';
  }
  if (row.source === 'statements') {
    return describeRule(row.rule);
  }
  return PAYROLL_CLAIM[row.source];
};

const DESTINATION_LABEL: Record<string, string> = {
  waterfall: 'Down the waterfall',
  line: 'Earmarked to a line',
  excluded: 'Outside the budget',
};

const SOURCE_LABEL: Record<string, string> = {
  statements: 'Matched from statements',
  pending_salary: 'Salary still to be paid',
  pending_bonus: 'Bonuses still to be paid',
};

type IncomeFormValues = z.input<typeof budgetIncomeLineSchema>;

const readsPayroll = (values: IncomeFormValues) =>
  values.source !== undefined && values.source !== 'statements';

const incomeFields = (lineOptions: { label: string; value: string }[]) => [
  { name: 'name' as const, label: 'Name', type: 'input' as const },
  {
    name: 'source' as const,
    label: 'Where the amount comes from',
    type: 'select' as const,
    options: Object.entries(SOURCE_LABEL).map(([value, label]) => ({ label, value })),
  },
  {
    name: 'destination' as const,
    label: 'Where it goes',
    type: 'select' as const,
    options: [
      { label: 'Down the waterfall — ordinary income', value: 'waterfall' },
      { label: 'Earmarked to one line', value: 'line' },
      { label: 'Outside the budget — a bonus you will not spend', value: 'excluded' },
    ],
  },
  {
    name: 'destinationLineId' as const,
    label: 'Which line (only if earmarked)',
    type: 'select' as const,
    options: lineOptions,
  },
  {
    name: 'rule.categories' as const,
    label: 'Categories',
    type: 'stringArray' as const,
    displayCondition: (values: IncomeFormValues) => !readsPayroll(values),
    valueWhenHidden: [] as string[],
  },
  {
    name: 'rule.tags' as const,
    label: 'Tags',
    type: 'stringArray' as const,
    displayCondition: (values: IncomeFormValues) => !readsPayroll(values),
    valueWhenHidden: [] as string[],
  },
  {
    name: 'rule.statementKinds' as const,
    label: 'Statement kinds',
    type: 'stringArray' as const,
    displayCondition: (values: IncomeFormValues) => !readsPayroll(values),
    valueWhenHidden: [] as string[],
  },
];

const EditIncome = ({
  line,
  budgetYearId,
  lineOptions,
}: {
  line: IncomeLine;
  budgetYearId: string;
  lineOptions: { label: string; value: string }[];
}) => {
  const router = useRouter();
  const mutation = api.budget.updateIncomeLine.useMutation();
  return (
    <MutationModal
      button={<RowActionTrigger icon={Pencil} label="Edit" />}
      defaultValues={{
        id: line.id,
        budgetYearId,
        name: line.name,
        rule: line.rule,
        source: line.source,
        destination: line.destination,
        destinationLineId: line.destinationLineId,
      }}
      fields={incomeFields(lineOptions)}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={budgetIncomeLineSchema.extend({ id: z.string(), budgetYearId: z.string() })}
      successToast={() => 'Income line updated'}
      titleText={`Edit ${line.name}`}
    />
  );
};

const EditOpeningBalance = ({ detail }: { detail: YearDetail }) => {
  const router = useRouter();
  const mutation = api.budget.updateYear.useMutation();
  const { year, lines } = detail;
  return (
    <MutationModal
      button={<RowActionTrigger icon={Pencil} label="Edit" />}
      defaultValues={{
        id: year.id,
        name: year.name,
        startDate: year.startDate,
        endDate: year.endDate,
        openingBalanceLineId: year.openingBalanceLineId ?? NO_LINE,
      }}
      fields={[
        {
          name: 'openingBalanceLineId' as const,
          label: 'Where last year’s leftover goes',
          type: 'select' as const,
          options: [
            { label: 'The general pot — like salary', value: NO_LINE },
            ...lines.map((line) => ({ label: `Set aside for ${line.name}`, value: line.id })),
          ],
        },
      ]}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={z.object({
        id: z.string(),
        name: z.string(),
        startDate: z.date(),
        endDate: z.date(),
        openingBalanceLineId: z
          .string()
          .nullable()
          .transform((value) => (value === null || value === NO_LINE ? null : value)),
      })}
      successToast={() => 'Opening balance updated'}
      titleText="Carried in from last year"
    />
  );
};

const DeleteIncome = ({ id, budgetYearId }: { id: string; budgetYearId: string }) => {
  const router = useRouter();
  const mutation = api.budget.deleteIncomeLine.useMutation();
  return (
    <DeleteConfirmationDialog
      mutation={mutation}
      mutationInput={{ id, budgetYearId }}
      refresh={() => {
        router.refresh();
      }}
    >
      <RowActionTrigger destructive icon={Trash} label="Delete" />
    </DeleteConfirmationDialog>
  );
};

const incomeColumns = ({
  detail,
  lineOptions,
}: {
  detail: YearDetail;
  lineOptions: { label: string; value: string }[];
}): ColumnDef<IncomeRow>[] => {
  const { year, lines, pendingByLine } = detail;
  const targetName = (id: string | null) =>
    id === null ? null : (lines.find((line) => line.id === id)?.name ?? '?');

  return [
    {
      id: 'position',
      header: () => <span className={POSITION_INDENT}>#</span>,
      cell: ({ row }) => (
        <span className={POSITION_INDENT}>{row.original.kind === 'opening' ? '' : row.index}</span>
      ),
      enableSorting: false,
      enableHiding: false,
      size: BUDGET_COLUMN_SIZE.position,
    },
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) =>
        row.original.kind === 'opening' ? (
          <span className="font-medium">
            Carried in from last year
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {formatCurrency(row.original.amount)}
            </span>
          </span>
        ) : (
          <span className="font-medium">
            {row.original.name}
            {Object.hasOwn(pendingByLine, row.original.id) ? (
              <span className="text-muted-foreground ml-2 font-normal tabular-nums">
                {formatCurrency(pendingByLine[row.original.id])}
              </span>
            ) : null}
          </span>
        ),
      enableSorting: false,
    },
    {
      id: 'claims',
      header: 'Claims',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{describeClaims(row.original)}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'destination',
      header: 'Goes to',
      cell: ({ row }) => {
        if (row.original.kind === 'opening') {
          const target = targetName(row.original.destinationLineId);
          return (
            <span>{target === null ? 'The general pot' : `Earmarked to a line → ${target}`}</span>
          );
        }
        const { destination, destinationLineId } = row.original;
        const target = targetName(destinationLineId);
        return (
          <span>
            {DESTINATION_LABEL[destination]}
            {target === null ? null : ` → ${target}`}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.original.kind === 'opening' ? (
          <RowActions collapse="always">
            <EditOpeningBalance detail={detail} />
          </RowActions>
        ) : (
          <RowActions>
            <EditIncome budgetYearId={year.id} line={row.original} lineOptions={lineOptions} />
            <DeleteIncome budgetYearId={year.id} id={row.original.id} />
          </RowActions>
        ),
      enableSorting: false,
      enableHiding: false,
      size: BUDGET_COLUMN_SIZE.actions,
    },
    dragHandleColumn((row) => row.kind === 'opening'),
  ];
};

export const BudgetIncome = ({ detail }: { detail: YearDetail }) => {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const addIncome = api.budget.createIncomeLine.useMutation();
  const reorderIncomeLines = api.budget.reorderIncomeLines.useMutation();
  const { year, incomeLines, lines, openingBalance } = detail;
  const lineOptions = lines.map((line) => ({ label: line.name, value: line.id }));

  const [orderedLines, setOrderedLines] = useOptimistic(
    incomeLines,
    (_, next: IncomeLine[]) => next,
  );

  const rows: IncomeRow[] = [
    {
      kind: 'opening',
      id: OPENING_ROW_ID,
      amount: openingBalance,
      destinationLineId: year.openingBalanceLineId,
    },
    ...orderedLines.map((line) => ({ kind: 'line' as const, ...line })),
  ];

  const { table } = useDataTable({
    data: rows,
    columns: incomeColumns({ detail, lineOptions }),
    pageCount: -1,
  });

  return (
    <DataTable
      enablePagination={false}
      getItemValue={(item) => item.id}
      layout="fixed"
      table={table}
      onValueChange={(items) => {
        const next = items
          .map((item) => item.original)
          .filter((item): item is { kind: 'line' } & IncomeLine => item.kind === 'line')
          .map(({ kind: _kind, ...line }) => line as IncomeLine);
        startTransition(async () => {
          setOrderedLines(next);
          await reorderIncomeLines.mutateAsync({
            budgetYearId: year.id,
            orderedIds: next.map((item) => item.id),
          });
          router.refresh();
        });
      }}
    >
      <DataTableToolbar
        table={table}
        title={
          <span className="flex items-center gap-1">
            Income
            <BudgetIncomeHelp />
          </span>
        }
      >
        <MutationModal
          button={
            <Button size="sm" variant="outline">
              Add Income Line
            </Button>
          }
          defaultValues={{
            name: '',
            rule: emptyBudgetRule,
            source: 'statements' as const,
            destination: 'waterfall' as const,
            destinationLineId: null,
            budgetYearId: year.id,
          }}
          fields={incomeFields(lineOptions)}
          mutation={addIncome}
          refresh={() => {
            router.refresh();
          }}
          schema={budgetIncomeLineSchema.extend({ budgetYearId: z.string() })}
          successToast={() => 'Income line added'}
          titleText="Add Income Line"
        />
      </DataTableToolbar>
    </DataTable>
  );
};
