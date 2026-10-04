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
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import {
  budgetLineFormSchema,
  emptyBudgetRule,
  type budgetAllocationKinds,
  type BudgetRule,
} from '@/types/budget';

import { BUDGET_COLUMN_SIZE, dragHandleColumn, POSITION_INDENT } from './columns';
import { LineBreakdown } from './line-breakdown';

import type { ColumnDef } from '@tanstack/react-table';

import { BudgetLinesHelp } from '../_help/budget-lines-help';

type Detail = RouterOutput['budget']['getYearDetail'];

type WaterfallRow = {
  lineId: string;
  name: string;
  rule: BudgetRule;
  allocationKind: string;
  allocationAmount: number;
  actual: number;
  yearBudget: number;
  committed: number;
  remaining: number;
  closed: boolean;
  overspent: boolean;
  line: Detail['lines'][number] | undefined;
  projected: Detail['projection']['lines'][number] | undefined;
  matchedCount: number;
};

const ALLOCATION_LABELS: Record<(typeof budgetAllocationKinds)[number], string> = {
  monthly: 'Fixed amount per month',
  annual: 'Fixed amount per year',
  earmarked: 'Funded only by earmarked income',
  schedule: 'Taken from the loan schedule',
  residual: 'Residual — whatever is left',
};

const allocationKinds = Object.keys(ALLOCATION_LABELS) as (typeof budgetAllocationKinds)[number][];

type LineFormValues = z.input<typeof budgetLineFormSchema>;

const TYPED_ALLOCATIONS = new Set(['monthly', 'annual']);

const readsSchedule = (values: LineFormValues) => values.allocationKind === 'schedule';

const lineFields = [
  { name: 'name' as const, label: 'Name', type: 'input' as const },
  {
    name: 'allocationKind' as const,
    label: 'Allocation',
    type: 'select' as const,
    options: allocationKinds.map((kind) => ({ label: ALLOCATION_LABELS[kind], value: kind })),
  },
  {
    name: 'allocationAmount' as const,
    label: 'Amount',
    type: 'input' as const,
    displayCondition: (values: LineFormValues) => TYPED_ALLOCATIONS.has(values.allocationKind),
    valueWhenHidden: '0',
  },
  {
    name: 'allocationAmount' as const,
    label: 'Goal for the year',
    type: 'input' as const,
    description: 'What you are aiming to finish the year with.',
    displayCondition: (values: LineFormValues) => values.allocationKind === 'residual',
    valueWhenHidden: '0',
  },
  {
    name: 'discretionary' as const,
    label: 'I can choose to spend less on this',
    type: 'checkbox' as const,
    displayCondition: (values: LineFormValues) => !readsSchedule(values),
    valueWhenHidden: false,
  },
  {
    name: 'closed' as const,
    label: 'Done for the year — nothing more to spend here',
    type: 'checkbox' as const,
    displayCondition: (values: LineFormValues) =>
      !readsSchedule(values) && values.allocationKind !== 'residual',
    valueWhenHidden: false,
  },
  {
    name: 'rule.tags' as const,
    label: 'Tags',
    type: 'stringArray' as const,
    description: 'The only thing a loan schedule line matches on.',
  },
  {
    name: 'rule.categories' as const,
    label: 'Categories',
    type: 'stringArray' as const,
    displayCondition: (values: LineFormValues) => !readsSchedule(values),
    valueWhenHidden: [] as string[],
  },
  {
    name: 'rule.statementKinds' as const,
    label: 'Statement kinds',
    type: 'stringArray' as const,
    displayCondition: (values: LineFormValues) => !readsSchedule(values),
    valueWhenHidden: [] as string[],
  },
  {
    name: 'rule.accounts' as const,
    label: 'Account / friend ids',
    type: 'stringArray' as const,
    displayCondition: (values: LineFormValues) => !readsSchedule(values),
    valueWhenHidden: [] as string[],
  },
];

const ALLOCATION_SUFFIX: Partial<Record<string, string>> = { monthly: '/mo', annual: '/yr' };

const describeAllocation = (kind: string, amount: number): string => {
  const suffix = ALLOCATION_SUFFIX[kind];
  return suffix === undefined ? '—' : `${formatCurrency(amount)} ${suffix}`;
};

const EditLine = ({ row, budgetYearId }: { row: WaterfallRow; budgetYearId: string }) => {
  const router = useRouter();
  const mutation = api.budget.updateLine.useMutation();
  const { line } = row;
  if (line === undefined) {
    return null;
  }
  return (
    <MutationModal
      button={<RowActionTrigger icon={Pencil} label="Edit" />}
      defaultValues={{
        id: line.id,
        budgetYearId,
        name: line.name,
        rule: line.rule as BudgetRule,
        allocationKind: line.allocationKind,
        allocationAmount: line.allocationAmount,
        discretionary: line.discretionary,
        closed: line.closed,
      }}
      fields={lineFields}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={budgetLineFormSchema.extend({ id: z.string() })}
      successToast={() => 'Line updated'}
      titleText={`Edit ${line.name}`}
    />
  );
};

const DeleteLine = ({ id, budgetYearId }: { id: string; budgetYearId: string }) => {
  const router = useRouter();
  const mutation = api.budget.deleteLine.useMutation();
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

const waterfallColumns = (
  budgetYearId: string,
  projection: Detail['projection'],
): ColumnDef<WaterfallRow>[] => [
  {
    id: 'position',
    header: () => <span className={POSITION_INDENT}>#</span>,
    cell: ({ row }) => <span className={POSITION_INDENT}>{row.index + 1}</span>,
    enableSorting: false,
    enableHiding: false,
    size: BUDGET_COLUMN_SIZE.position,
  },
  {
    accessorKey: 'name',
    header: 'Line',
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.name}
        {row.original.closed ? (
          <span className="text-muted-foreground ml-2 text-xs font-normal">done</span>
        ) : null}
      </span>
    ),
    enableSorting: false,
  },
  {
    id: 'claims',
    header: 'Claims',
    size: BUDGET_COLUMN_SIZE.claims,
    cell: ({ row }) => (
      <span className="text-muted-foreground block max-w-[320px] truncate text-xs">
        {describeRule(row.original.rule)}
      </span>
    ),
    enableSorting: false,
  },
  {
    id: 'allocation',
    header: 'Allocation',
    cell: ({ row }) =>
      describeAllocation(row.original.allocationKind, row.original.allocationAmount),
    enableSorting: false,
    meta: { align: 'right' },
  },
  {
    id: 'yearBudget',
    header: 'Year budget',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatCurrency(row.original.yearBudget)}</span>
    ),
    enableSorting: false,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'actual',
    header: 'Actual',
    cell: ({ row }) => formatCurrency(row.original.actual),
    enableSorting: false,
    meta: { align: 'right' },
  },
  {
    id: 'committed',
    header: 'Committed',
    cell: ({ row }) =>
      row.original.committed === 0 ? (
        <span className="text-muted-foreground">--</span>
      ) : (
        <span className="text-muted-foreground">{formatCurrency(row.original.committed)}</span>
      ),
    enableSorting: false,
    meta: { align: 'right' },
  },
  {
    id: 'remaining',
    header: 'Remaining',
    cell: ({ row }) => (
      <span className={row.original.overspent ? 'text-destructive' : undefined}>
        {formatCurrency(row.original.remaining)}
      </span>
    ),
    enableSorting: false,
    meta: { align: 'right' },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <RowActions>
        {row.original.projected === undefined ? null : (
          <LineBreakdown
            claims={describeRule(row.original.rule)}
            line={row.original.projected}
            matchedCount={row.original.matchedCount}
            projection={projection}
          />
        )}
        <EditLine budgetYearId={budgetYearId} row={row.original} />
        <DeleteLine budgetYearId={budgetYearId} id={row.original.lineId} />
      </RowActions>
    ),
    enableSorting: false,
    enableHiding: false,
    size: BUDGET_COLUMN_SIZE.actions,
  },
  dragHandleColumn(),
];

export const BudgetWaterfall = ({ detail }: { detail: Detail }) => {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const addLine = api.budget.addLine.useMutation();
  const reorderLines = api.budget.reorderLines.useMutation();
  const { year, lines, totals, projection } = detail;

  const projected = new Map(projection.lines.map((line) => [line.lineId, line]));
  const lineById = new Map(lines.map((line) => [line.id, line]));

  const serverRows: WaterfallRow[] = totals.map((line) => ({
    lineId: line.lineId,
    name: line.name,
    rule: (lineById.get(line.lineId)?.rule as BudgetRule | undefined) ?? emptyBudgetRule,
    allocationKind: line.allocationKind,
    allocationAmount: line.allocationAmount,
    actual: line.actual,
    yearBudget: projected.get(line.lineId)?.yearBudget ?? 0,
    committed: projected.get(line.lineId)?.committed ?? 0,
    closed: line.closed,
    remaining: projected.get(line.lineId)?.remaining ?? 0,
    overspent: projected.get(line.lineId)?.overspent ?? false,
    line: lineById.get(line.lineId),
    projected: projected.get(line.lineId),
    matchedCount: line.matchedCount,
  }));

  const [rows, setRows] = useOptimistic(serverRows, (_, next: WaterfallRow[]) => next);

  const { table } = useDataTable({
    data: rows,
    columns: waterfallColumns(year.id, projection),
    pageCount: -1,
  });

  return (
    <div className="flex w-full flex-col gap-2.5">
      <DataTable
        enablePagination={false}
        getItemValue={(item) => item.lineId}
        layout="fixed"
        table={table}
        onValueChange={(items) => {
          const next = items.map((item) => item.original);
          startTransition(async () => {
            setRows(next);
            await reorderLines.mutateAsync({
              budgetYearId: year.id,
              orderedIds: next.map((item) => item.lineId),
            });
            router.refresh();
          });
        }}
      >
        <DataTableToolbar
          table={table}
          title={
            <span className="flex items-center gap-1">
              {year.name}
              <BudgetLinesHelp />
            </span>
          }
        >
          <MutationModal
            button={
              <Button size="sm" variant="outline">
                Add Line
              </Button>
            }
            defaultValues={{
              name: '',
              rule: emptyBudgetRule,
              allocationKind: 'monthly' as const,
              allocationAmount: '0',
              discretionary: true,
              closed: false,
              budgetYearId: year.id,
            }}
            fields={lineFields}
            mutation={addLine}
            refresh={() => {
              router.refresh();
            }}
            schema={budgetLineFormSchema}
            successToast={() => 'Line added'}
            titleText="Add Budget Line"
          />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
};
