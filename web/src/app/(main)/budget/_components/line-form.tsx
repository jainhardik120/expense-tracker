'use client';

import { useRouter } from 'next/navigation';

import { Pencil, Trash } from 'lucide-react';

import { RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import MutationModal from '@/components/mutation-modal';
import { api } from '@/server/react';
import {
  budgetLineEditSchema,
  type budgetAllocationKinds,
  type budgetLineFormSchema,
} from '@/types/budget';
import type { YearDetail } from '@/types/router-outputs';

import type { z } from 'zod';

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

export const lineFields = [
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
  {
    name: 'rule.minAmount' as const,
    label: 'Minimum amount',
    type: 'nullableNumber' as const,
    min: 0,
    step: 0.01,
    description: 'Only counts statements of at least this amount. Leave empty for no limit.',
    displayCondition: (values: LineFormValues) => !readsSchedule(values),
    valueWhenHidden: null,
  },
  {
    name: 'rule.maxAmount' as const,
    label: 'Maximum amount',
    type: 'nullableNumber' as const,
    min: 0,
    step: 0.01,
    description: 'Only counts statements of at most this amount. Leave empty for no limit.',
    displayCondition: (values: LineFormValues) => !readsSchedule(values),
    valueWhenHidden: null,
  },
];

export const EditLine = ({
  line,
  budgetYearId,
}: {
  line: YearDetail['lines'][number] | undefined;
  budgetYearId: string;
}) => {
  const router = useRouter();
  const mutation = api.budget.updateLine.useMutation();
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
        rule: line.rule,
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
      schema={budgetLineEditSchema}
      successToast={() => 'Line updated'}
      titleText={`Edit ${line.name}`}
    />
  );
};

export const DeleteLine = ({ id, budgetYearId }: { id: string; budgetYearId: string }) => {
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
