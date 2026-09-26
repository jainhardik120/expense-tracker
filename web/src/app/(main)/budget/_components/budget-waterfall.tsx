'use client';

import { useRouter } from 'next/navigation';

import { Trash } from 'lucide-react';

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
  { name: 'name' as const, label: 'Name', type: 'text' as const },
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
  { name: 'allocationAmount' as const, label: 'Amount', type: 'text' as const },
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
  const { year, lines, totals, unclaimedCount, unclaimedTotal } = detail;
  const ruleById = new Map(lines.map((line) => [line.id, line.rule as BudgetRule]));

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
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Txns</TableHead>
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
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(line.actual)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {line.matchedCount}
                </TableCell>
                <TableCell className="text-right">
                  <DeleteLine budgetYearId={year.id} id={line.lineId} />
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
