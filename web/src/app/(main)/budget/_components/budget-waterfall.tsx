'use client';

import { useOptimistic, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { GripVertical, Pencil, Trash } from 'lucide-react';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { SortableItemHandle } from '@/components/ui/sortable';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import {
  budgetLineFormSchema,
  emptyBudgetRule,
  type budgetAllocationKinds,
  type BudgetRule,
} from '@/types/budget';

import { BUDGET_COLUMN_SIZE, POSITION_INDENT } from './column-widths';

import type { ColumnDef } from '@tanstack/react-table';

type Detail = RouterOutput['budget']['getYearDetail'];

/** One line, with everything the table shows about it gathered in one place. */
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
};

/**
 * Every kind the enum allows, labelled.
 *
 * Typed as a total record rather than written out as an option list: a kind
 * missing from the list leaves the select with nothing to show for a line that
 * already uses it -- Gym, on its loan schedule, opened blank -- and submitting
 * the form then quietly traded that kind for whichever one got picked instead.
 * Adding a kind to the enum now fails to compile until it is named here.
 */
const ALLOCATION_LABELS: Record<(typeof budgetAllocationKinds)[number], string> = {
  monthly: 'Fixed amount per month',
  annual: 'Fixed amount per year',
  earmarked: 'Funded only by earmarked income',
  schedule: 'Taken from the loan schedule',
  residual: 'Residual — whatever is left',
};

// Listed in the order they make sense in, which is not the order they are
// stored in.
const allocationKinds = Object.keys(ALLOCATION_LABELS) as (typeof budgetAllocationKinds)[number][];

const lineFields = [
  { name: 'name' as const, label: 'Name', type: 'input' as const },
  {
    name: 'allocationKind' as const,
    label: 'Allocation',
    type: 'select' as const,
    options: allocationKinds.map((kind) => ({ label: ALLOCATION_LABELS[kind], value: kind })),
  },
  { name: 'allocationAmount' as const, label: 'Amount', type: 'input' as const },
  {
    name: 'discretionary' as const,
    label: 'I can choose to spend less on this',
    type: 'checkbox' as const,
  },
  {
    name: 'closed' as const,
    label: 'Done for the year — nothing more to spend here',
    type: 'checkbox' as const,
  },
  { name: 'rule.categories' as const, label: 'Categories', type: 'stringArray' as const },
  { name: 'rule.tags' as const, label: 'Tags', type: 'stringArray' as const },
  { name: 'rule.statementKinds' as const, label: 'Statement kinds', type: 'stringArray' as const },
  { name: 'rule.accounts' as const, label: 'Account / friend ids', type: 'stringArray' as const },
];

/** A one-line read of what a rule claims, so the table explains itself. */
const describeRule = (rule: BudgetRule): string => {
  const parts: string[] = [];
  if (rule.categories.length > 0) {
    parts.push(`category: ${rule.categories.join(', ')}`);
  }
  if (rule.tags.length > 0) {
    parts.push(`tag: ${rule.tags.join(', ')}`);
  }
  if (rule.accounts.length > 0) {
    parts.push(`${rule.accounts.length} account(s)`);
  }
  if (rule.statementKinds.length > 0) {
    parts.push(rule.statementKinds.join(', '));
  }
  return parts.length === 0 ? 'everything not claimed above' : parts.join(' · ');
};

// Only the fixed allocations carry a figure; residual and earmarked lines get
// whatever the waterfall leaves them, so there is no number to show.
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

const waterfallColumns = (budgetYearId: string): ColumnDef<WaterfallRow>[] => [
  {
    id: 'position',
    // Both the heading and the number carry the same indent, so the column
    // reads as inset from the table's edge rather than pressed against it.
    header: () => <span className={POSITION_INDENT}>#</span>,
    // The number is the precedence, not a field: it counts rows down the
    // table. `row.index` is the position in the data, which is the position on
    // screen here because these rows are never sorted or paged -- their order
    // is the meaning, and the user sets it by dragging.
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
    // Blank rather than a zero: most lines have nothing scheduled, and a column
    // of noughts would bury the handful that do.
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
        <EditLine budgetYearId={budgetYearId} row={row.original} />
        <DeleteLine budgetYearId={budgetYearId} id={row.original.lineId} />
      </RowActions>
    ),
    enableSorting: false,
    enableHiding: false,
    size: BUDGET_COLUMN_SIZE.actions,
  },
  {
    id: 'drag-handle',
    header: '',
    cell: () => (
      <SortableItemHandle asChild>
        <Button className="size-8" size="icon" variant="ghost">
          <GripVertical className="size-4" />
        </Button>
      </SortableItemHandle>
    ),
    enableSorting: false,
    enableHiding: false,
    size: BUDGET_COLUMN_SIZE.dragHandle,
  },
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
  }));

  // The dropped row stays where it was dropped while the reorder is in flight.
  // Without this the table would snap back to the server's order and only
  // settle once the refresh arrived, which reads as the drag having failed.
  const [rows, setRows] = useOptimistic(serverRows, (_, next: WaterfallRow[]) => next);

  const { table } = useDataTable({
    data: rows,
    columns: waterfallColumns(year.id),
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
        <DataTableToolbar table={table} title={year.name}>
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
