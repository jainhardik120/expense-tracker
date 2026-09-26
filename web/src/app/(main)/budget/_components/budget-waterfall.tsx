'use client';

import { useRouter } from 'next/navigation';

import { ChevronDown, ChevronUp, Pencil, Trash } from 'lucide-react';
import { z } from 'zod';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import MutationModal from '@/components/mutation-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { budgetLineFormSchema, emptyBudgetRule, type BudgetRule } from '@/types/budget';

type Detail = RouterOutput['budget']['getYearDetail'];

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

const EditLine = ({
  line,
  budgetYearId,
}: {
  line: Detail['lines'][number] | undefined;
  budgetYearId: string;
}) => {
  const router = useRouter();
  const mutation = api.budget.updateLine.useMutation();
  if (line === undefined) {
    return null;
  }
  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" variant="ghost">
          <Pencil />
        </Button>
      }
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

/** Order is the semantics, so moving a line is a first class action. */
const MoveLine = ({
  orderedIds,
  index,
  budgetYearId,
}: {
  orderedIds: string[];
  index: number;
  budgetYearId: string;
}) => {
  const router = useRouter();
  const mutation = api.budget.reorderLines.useMutation();
  const move = (to: number) => {
    const next = [...orderedIds];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    mutation.mutate(
      { budgetYearId, orderedIds: next },
      {
        onSuccess: () => {
          router.refresh();
        },
      },
    );
  };
  return (
    <div className="flex">
      <Button
        className="size-8"
        disabled={index === 0}
        size="icon"
        variant="ghost"
        onClick={() => {
          move(index - 1);
        }}
      >
        <ChevronUp />
      </Button>
      <Button
        className="size-8"
        disabled={index === orderedIds.length - 1}
        size="icon"
        variant="ghost"
        onClick={() => {
          move(index + 1);
        }}
      >
        <ChevronDown />
      </Button>
    </div>
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
      <Button className="size-8" size="icon" variant="ghost">
        <Trash />
      </Button>
    </DeleteConfirmationDialog>
  );
};

export const BudgetWaterfall = ({ detail }: { detail: Detail }) => {
  const router = useRouter();
  const addLine = api.budget.addLine.useMutation();
  const { year, lines, totals, projection, unclaimedCount, unclaimedTotal } = detail;
  const projected = new Map(projection.lines.map((line) => [line.lineId, line]));
  const ruleById = new Map(lines.map((line) => [line.id, line.rule as BudgetRule]));
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const orderedIds = totals.map((line) => line.lineId);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{year.name}</CardTitle>
            <CardDescription>
              Lines are evaluated top to bottom and the first one that claims a transaction keeps
              it, so nothing is counted twice.
            </CardDescription>
          </div>
          <MutationModal
            button={<Button variant="outline">Add Line</Button>}
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Line</TableHead>
              <TableHead>Claims</TableHead>
              <TableHead className="text-right">Allocation</TableHead>
              <TableHead className="text-right">Year budget</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead className="text-right">Per month</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.map((line, index) => (
              <TableRow key={line.lineId}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{line.name}</TableCell>
                <TableCell className="text-muted-foreground max-w-[320px] truncate text-xs">
                  {describeRule(ruleById.get(line.lineId) ?? emptyBudgetRule)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {describeAllocation(line.allocationKind, line.allocationAmount)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {formatCurrency(projected.get(line.lineId)?.yearBudget ?? 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(line.actual)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    (projected.get(line.lineId)?.overspent ?? false) ? 'text-red-600' : ''
                  }`}
                >
                  {formatCurrency(projected.get(line.lineId)?.remaining ?? 0)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {formatCurrency(projected.get(line.lineId)?.perMonthRemaining ?? 0)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <MoveLine budgetYearId={year.id} index={index} orderedIds={orderedIds} />
                    <EditLine budgetYearId={year.id} line={lineById.get(line.lineId)} />
                    <DeleteLine budgetYearId={year.id} id={line.lineId} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {unclaimedCount === 0 ? null : (
          <p className="text-muted-foreground text-sm">
            <Badge variant="secondary">{unclaimedCount}</Badge> transactions worth{' '}
            {formatCurrency(unclaimedTotal)} were not claimed by any line — lending and settling
            with friends usually lands here, which is correct. Add a catch-all line at the bottom if
            you expected them counted.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
