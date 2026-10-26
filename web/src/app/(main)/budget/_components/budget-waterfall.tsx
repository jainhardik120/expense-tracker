'use client';

import { useOptimistic, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { RowActions } from '@/components/data-table/row-actions';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { describeRule } from '@/lib/budget-rules';
import { formatCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { api } from '@/server/react';
import { budgetLineFormSchema, emptyBudgetRule, type BudgetRule } from '@/types/budget';
import type { YearDetail } from '@/types/router-outputs';

import { ActualBreakdown } from './actual-breakdown';
import {
  BUDGET_COLUMN_SIZE,
  dragHandleColumn,
  POSITION_INDENT,
  ViewStatementsAction,
} from './columns';
import { LineBreakdown } from './line-breakdown';
import { DeleteLine, EditLine, lineFields } from './line-form';
import { CommittedValue, WaterfallValue, YearBudgetValue } from './waterfall-values';

import { BudgetLinesHelp } from '../_help/budget-lines-help';

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
  line: YearDetail['lines'][number] | undefined;
  projected: YearDetail['projection']['lines'][number] | undefined;
  matchedCount: number;
};

const ALLOCATION_SUFFIX: Partial<Record<string, string>> = {
  monthly: '/ mo',
  annual: '/ yr',
  residual: '',
};

const describeAllocation = (kind: string, amount: number): string => {
  const suffix = ALLOCATION_SUFFIX[kind];
  return suffix === undefined ? '—' : `${formatCurrency(amount)} ${suffix}`;
};

const waterfallColumns = (
  year: YearDetail['year'],
  projection: YearDetail['projection'],
  commitmentsByLine: YearDetail['commitmentsByLine'],
  actualsByLine: YearDetail['actualsByLine'],
): ColumnDef<WaterfallRow>[] => {
  const budgetYearId = year.id;
  return [
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
      cell: ({ row }) => <YearBudgetValue projection={projection} row={row.original} />,
      enableSorting: false,
      meta: { align: 'right' },
    },
    {
      accessorKey: 'actual',
      header: 'Actual',
      cell: ({ row }) => (
        <ActualBreakdown
          actual={row.original.actual}
          groups={actualsByLine[row.original.lineId] ?? []}
          name={row.original.name}
        />
      ),
      enableSorting: false,
      meta: { align: 'right' },
    },
    {
      id: 'committed',
      header: 'Committed',
      cell: ({ row }) => (
        <CommittedValue
          payments={commitmentsByLine[row.original.lineId] ?? []}
          row={row.original}
        />
      ),
      enableSorting: false,
      meta: { align: 'right' },
    },
    {
      id: 'remaining',
      header: 'Remaining',
      cell: ({ row }) => <WaterfallValue field="remaining" row={row.original} />,
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
          <ViewStatementsAction
            end={year.endDate}
            lineId={row.original.lineId}
            start={year.startDate}
          />
          <EditLine budgetYearId={budgetYearId} line={row.original.line} />
          <DeleteLine budgetYearId={budgetYearId} id={row.original.lineId} />
        </RowActions>
      ),
      enableSorting: false,
      enableHiding: false,
      size: BUDGET_COLUMN_SIZE.actions,
    },
    dragHandleColumn(),
  ];
};

export const BudgetWaterfall = ({ detail }: { detail: YearDetail }) => {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const createLine = api.budget.createLine.useMutation();
  const reorderLines = api.budget.reorderLines.useMutation();
  const { year, lines, totals, projection, commitmentsByLine, actualsByLine } = detail;

  const projected = new Map(projection.lines.map((line) => [line.lineId, line]));
  const lineById = new Map(lines.map((line) => [line.id, line]));

  const serverRows: WaterfallRow[] = totals.map((line) => ({
    lineId: line.lineId,
    name: line.name,
    rule: lineById.get(line.lineId)?.rule ?? emptyBudgetRule,
    allocationKind: line.allocationKind,
    allocationAmount: line.allocationAmount,
    actual: line.actual,
    yearBudget: projected.get(line.lineId)?.yearBudget ?? 0,
    committed:
      line.allocationKind === 'residual'
        ? (projected.get(line.lineId)?.yearBudget ?? 0) -
          (projected.get(line.lineId)?.allocationAmount ?? 0)
        : (projected.get(line.lineId)?.committed ?? 0),
    closed: line.closed,
    remaining:
      line.allocationKind === 'residual'
        ? (projected.get(line.lineId)?.allocationAmount ?? 0) -
          (projected.get(line.lineId)?.actual ?? 0)
        : (projected.get(line.lineId)?.remaining ?? 0),
    overspent: projected.get(line.lineId)?.overspent ?? false,
    line: lineById.get(line.lineId),
    projected: projected.get(line.lineId),
    matchedCount: line.matchedCount,
  }));

  const [rows, setRows] = useOptimistic(serverRows, (_, next: WaterfallRow[]) => next);

  const { table } = useDataTable({
    data: rows,
    columns: waterfallColumns(year, projection, commitmentsByLine, actualsByLine),
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
            mutation={createLine}
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
