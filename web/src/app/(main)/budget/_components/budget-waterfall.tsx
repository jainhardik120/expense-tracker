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
import { budgetLineFormSchema, emptyBudgetRule, type BudgetRule } from '@/types/budget';

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
  remaining: number;
  overspent: boolean;
  line: Detail['lines'][number] | undefined;
};

const lineFields = [
  { name: 'name' as const, label: 'Name', type: 'input' as const },
  {
    name: 'allocationKind' as const,
    label: 'Allocation',
    type: 'select' as const,
    options: [
      { label: 'Fixed amount per month', value: 'monthly' },
      { label: 'Fixed amount per year', value: 'annual' },
      { label: 'Funded only by earmarked income', value: 'earmarked' },
      { label: 'Residual — whatever is left', value: 'residual' },
    ],
  },
  { name: 'allocationAmount' as const, label: 'Amount', type: 'input' as const },
  {
    name: 'discretionary' as const,
    label: 'I can choose to spend less on this',
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
    header: '#',
    // The number is the precedence, not a field: it counts rows down the
    // table. `row.index` is the position in the data, which is the position on
    // screen here because these rows are never sorted or paged -- their order
    // is the meaning, and the user sets it by dragging.
    cell: ({ row }) => row.index + 1,
    enableSorting: false,
    enableHiding: false,
    size: 50,
  },
  {
    accessorKey: 'name',
    header: 'Line',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    enableSorting: false,
  },
  {
    id: 'claims',
    header: 'Claims',
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
    size: 60,
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
    size: 40,
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
