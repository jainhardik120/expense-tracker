'use client';

import { useRouter } from 'next/navigation';

import { Trash } from 'lucide-react';
import { z } from 'zod';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import MutationModal from '@/components/mutation-modal';
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
import { budgetIncomeLineSchema, emptyBudgetRule, type BudgetRule } from '@/types/budget';

type Detail = RouterOutput['budget']['getYearDetail'];

const DESTINATION_LABEL: Record<string, string> = {
  waterfall: 'Down the waterfall',
  line: 'Earmarked to a line',
  excluded: 'Outside the budget',
};

const incomeFields = (lineOptions: { label: string; value: string }[]) => [
  { name: 'name' as const, label: 'Name', type: 'input' as const },
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
  { name: 'rule.categories' as const, label: 'Categories', type: 'stringArray' as const },
  { name: 'rule.tags' as const, label: 'Tags', type: 'stringArray' as const },
  { name: 'rule.statementKinds' as const, label: 'Statement kinds', type: 'stringArray' as const },
];

const describeRule = (rule: BudgetRule): string => {
  const parts: string[] = [];
  if (rule.categories.length > 0) {
    parts.push(`category: ${rule.categories.join(', ')}`);
  }
  if (rule.tags.length > 0) {
    parts.push(`tag: ${rule.tags.join(', ')}`);
  }
  if (rule.statementKinds.length > 0) {
    parts.push(rule.statementKinds.join(', '));
  }
  if (rule.maxAmount !== null) {
    parts.push(`up to ${formatCurrency(rule.maxAmount)}`);
  }
  if (rule.minAmount !== null) {
    parts.push(`over ${formatCurrency(rule.minAmount)}`);
  }
  return parts.length === 0 ? 'everything not claimed above' : parts.join(' · ');
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
      <Button className="size-8" size="icon" variant="ghost">
        <Trash />
      </Button>
    </DeleteConfirmationDialog>
  );
};

export const BudgetIncome = ({ detail }: { detail: Detail }) => {
  const router = useRouter();
  const addIncome = api.budget.addIncomeLine.useMutation();
  const { year, incomeLines, lines } = detail;
  const lineOptions = lines.map((line) => ({ label: line.name, value: line.id }));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Income</CardTitle>
            <CardDescription>
              Matched in order, like the spending lines. Put the specific rules above the general
              ones, or a catch-all will swallow your salary.
            </CardDescription>
          </div>
          <MutationModal
            button={<Button variant="outline">Add Income Line</Button>}
            defaultValues={{
              name: '',
              rule: emptyBudgetRule,
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
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Claims</TableHead>
              <TableHead>Goes to</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {incomeLines.map((income, index) => (
              <TableRow key={income.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{income.name}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {describeRule(income.rule as BudgetRule)}
                </TableCell>
                <TableCell className="text-sm">
                  {DESTINATION_LABEL[income.destination]}
                  {income.destinationLineId === null
                    ? null
                    : ` → ${lines.find((l) => l.id === income.destinationLineId)?.name ?? '?'}`}
                </TableCell>
                <TableCell className="text-right">
                  <DeleteIncome budgetYearId={year.id} id={income.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
