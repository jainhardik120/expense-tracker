'use client';

import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { cn } from '@/lib/utils';
import { statementKindMap } from '@/types';

import {
  type AddKind,
  type Addition,
  type Decision,
  type Decisions,
  type LedgerOnlyRow,
  type LedgerOnlyStatus,
  type LedgerRow,
  ROW_STATUSES,
  type ReviewRow,
  type RowStatus,
  STATUS_LABELS,
  STATUS_TONES,
  type Suggestion,
} from './review-model';

import {
  EditableCell,
  SelectEditor,
  TagsEditor,
} from '../../../../statements/_components/editable-cells';
import { cleanDescription, formatShortDay } from '../../../_components/statement-labels';

const KIND_OPTIONS: Array<{ label: string; value: AddKind }> = [
  { label: statementKindMap.expense, value: 'expense' },
  { label: statementKindMap.outside_transaction, value: 'outside_transaction' },
  { label: statementKindMap.self_transfer, value: 'self_transfer' },
];

const TONE_CLASSES: Record<'good' | 'action' | 'info', string> = {
  good: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
  action: 'border-rose-500/40 text-rose-700 dark:text-rose-400',
  info: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
};

export type ReviewContext = {
  decisions: Decisions;
  update: (ids: string[], change: Partial<Decision>) => void;
  editable: boolean;
  accountId: string;
  accounts: Array<{ id: string; accountName: string }>;
  categories: string[];
  tags: string[];
  ledger: Record<string, LedgerRow | undefined>;
  counts: Record<RowStatus, number>;
};

const Muted = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);

const Money = ({ value, direction }: { value: number; direction: 'debit' | 'credit' }) => (
  <span
    className={cn(
      'tabular-nums',
      direction === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : undefined,
    )}
  >
    {direction === 'credit' ? '+' : '−'}
    {formatCurrency(value)}
  </span>
);

const LedgerEntry = ({ row }: { row: LedgerRow }) => (
  <span className="flex items-center justify-between gap-3 whitespace-nowrap">
    <span className="truncate">
      {row.label}
      <Muted> · {formatShortDay(row.date)}</Muted>
    </span>
    <Money direction={row.direction} value={row.amount} />
  </span>
);

const editableAddition = (row: ReviewRow, context: ReviewContext) => {
  const { addition } = row;
  if (addition === null) {
    return null;
  }
  const decision = context.decisions[addition.id];
  if (decision === undefined || !decision.accepted || decision.mode === 'fold') {
    return null;
  }
  return { addition, decision };
};

const ChangeCell = ({ row, context }: { row: ReviewRow; context: ReviewContext }) => {
  const parts = row.suggestions.map((suggestion) => (
    <SuggestionText key={suggestion.id} context={context} suggestion={suggestion} />
  ));
  return parts.length === 0 ? null : <div className="flex flex-col gap-1">{parts}</div>;
};

const SuggestionText = ({
  suggestion,
  context,
}: {
  suggestion: Suggestion;
  context: ReviewContext;
}) => {
  if (suggestion.type === 'adjust') {
    const ledgerRow = context.ledger[suggestion.ledger];
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        Correct {ledgerRow?.label ?? 'entry'}
        <Muted>{formatCurrency(suggestion.from)}</Muted>
        <ArrowRight className="size-3" />
        <span className="font-medium">{formatCurrency(suggestion.to)}</span>
      </span>
    );
  }
  if (suggestion.type === 'redate') {
    const ledgerRow = context.ledger[suggestion.ledger];
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        Move {ledgerRow?.label ?? 'entry'}
        <Muted>{formatShortDay(suggestion.from)}</Muted>
        <ArrowRight className="size-3" />
        {formatShortDay(suggestion.to)}
      </span>
    );
  }
  if (suggestion.type === 'add' || suggestion.type === 'add_difference') {
    return <AdditionMode addition={suggestion} context={context} />;
  }
  return null;
};

const AdditionMode = ({ addition, context }: { addition: Addition; context: ReviewContext }) => {
  const decision = context.decisions[addition.id];
  const target = addition.foldInto === null ? undefined : context.ledger[addition.foldInto];
  const label =
    addition.type === 'add_difference' ? `Add ${formatCurrency(addition.amount)} left over` : 'Add';
  if (target === undefined || decision === undefined) {
    return <span>{label} as a new entry</span>;
  }
  return (
    <Select
      disabled={!context.editable}
      value={decision.mode}
      onValueChange={(mode) => {
        context.update([addition.id], { mode: mode === 'fold' ? 'fold' : 'new' });
      }}
    >
      <SelectTrigger className="h-7 w-full max-w-72 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fold">
          Add to {target.label} {formatCurrency(target.amount)} · {formatShortDay(target.date)}
        </SelectItem>
        <SelectItem value="new">{label} as a new entry</SelectItem>
      </SelectContent>
    </Select>
  );
};

const TransferTarget = ({
  current,
  direction,
}: {
  current: { label: string } | undefined;
  direction: 'debit' | 'credit';
}) => {
  if (current === undefined) {
    return <span className="text-destructive">Pick an account</span>;
  }
  return <span>{`${direction === 'credit' ? 'From' : 'To'} ${current.label}`}</span>;
};

const StatusBadge = ({ status }: { status: RowStatus | LedgerOnlyStatus }) => (
  <Badge className={TONE_CLASSES[STATUS_TONES[status]]} variant="outline">
    {STATUS_LABELS[status]}
  </Badge>
);

export const ledgerOnlyColumns = (): Array<ColumnDef<LedgerOnlyRow>> => [
  {
    id: 'date',
    header: 'Date',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{formatShortDay(row.original.date)}</span>
    ),
    enableHiding: false,
  },
  {
    id: 'entry',
    header: 'Your entry',
    cell: ({ row }) => (
      <span>
        {row.original.label}
        {row.original.tags.length === 0 ? null : <Muted> · {row.original.tags.join(', ')}</Muted>}
      </span>
    ),
    meta: { label: 'Your entry' },
  },
  {
    id: 'amount',
    header: 'Amount',
    cell: ({ row }) => <Money direction={row.original.direction} value={row.original.amount} />,
    meta: { align: 'right', label: 'Amount' },
  },
  {
    id: 'ledgerStatus',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
    meta: { label: 'Status' },
  },
  {
    id: 'note',
    header: 'Note',
    cell: ({ row }) =>
      row.original.matchedOn === null ? (
        <Muted>
          {row.original.status === 'likely_next'
            ? 'Dated in the last days of the period'
            : 'The bank did not charge this here'}
        </Muted>
      ) : (
        <Link className="hover:underline" href={`/inbox/statements/${row.original.matchedOn.id}`}>
          Matched on the statement ending {formatShortDay(row.original.matchedOn.periodEnd)}
        </Link>
      ),
    meta: { label: 'Note' },
  },
];

const statusFilter = (row: { original: ReviewRow }, _columnId: string, value: unknown) =>
  !Array.isArray(value) || value.length === 0 || value.includes(row.original.status);

export const reviewColumns = (context: ReviewContext): Array<ColumnDef<ReviewRow>> => [
  {
    id: 'apply',
    header: ({ table }) => {
      const actionable = table
        .getFilteredRowModel()
        .rows.flatMap((row) => row.original.suggestions.map((suggestion) => suggestion.id));
      const accepted = actionable.filter((id) => context.decisions[id]?.accepted === true);
      return (
        <Checkbox
          aria-label="Apply every change shown"
          checked={
            actionable.length > 0 && accepted.length === actionable.length
              ? true
              : accepted.length > 0 && 'indeterminate'
          }
          className="translate-y-0.5"
          disabled={!context.editable || actionable.length === 0}
          onCheckedChange={(value) => {
            context.update(actionable, { accepted: value === true });
          }}
        />
      );
    },
    cell: ({ row }) => {
      const ids = row.original.suggestions.map((suggestion) => suggestion.id);
      if (ids.length === 0) {
        return null;
      }
      const accepted = ids.filter((id) => context.decisions[id]?.accepted === true);
      return (
        <Checkbox
          aria-label="Apply this change"
          checked={accepted.length === ids.length ? true : accepted.length > 0 && 'indeterminate'}
          className="translate-y-0.5"
          disabled={!context.editable}
          onCheckedChange={(value) => {
            context.update(ids, { accepted: value === true });
          }}
        />
      );
    },
    enableHiding: false,
    meta: { selectable: false },
    size: 40,
  },
  {
    id: 'date',
    header: 'Date',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{formatShortDay(row.original.date)}</span>
    ),
    enableHiding: false,
  },
  {
    id: 'description',
    header: 'On the statement',
    cell: ({ row }) => (
      <span className="block max-w-80 truncate" title={row.original.description}>
        {cleanDescription(row.original.description)}
      </span>
    ),
    meta: { label: 'On the statement' },
  },
  {
    id: 'amount',
    header: 'Amount',
    cell: ({ row }) => <Money direction={row.original.direction} value={row.original.amount} />,
    meta: { align: 'right', label: 'Amount' },
  },
  {
    id: 'status',
    accessorFn: (row) => row.status,
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
    filterFn: statusFilter,
    meta: {
      label: 'Status',
      variant: 'multiSelect',
      options: ROW_STATUSES.filter((status) => context.counts[status] > 0).map((status) => ({
        label: STATUS_LABELS[status],
        value: status,
        count: context.counts[status],
      })),
    },
    enableColumnFilter: true,
  },
  {
    id: 'ledger',
    header: 'In your ledger',
    cell: ({ row }) =>
      row.original.ledger.length === 0 ? (
        <Muted>-</Muted>
      ) : (
        <div className="flex min-w-56 flex-col gap-0.5">
          {row.original.ledger.map((entry) => (
            <LedgerEntry key={entry.key} row={entry} />
          ))}
        </div>
      ),
    meta: { label: 'In your ledger' },
  },
  {
    id: 'change',
    header: 'Change',
    cell: ({ row }) => <ChangeCell context={context} row={row.original} />,
    meta: { label: 'Change' },
  },
  {
    id: 'kind',
    header: 'Save as',
    cell: ({ row }) => {
      const editing = editableAddition(row.original, context);
      if (editing === null) {
        return null;
      }
      return (
        <EditableCell
          columnId="kind"
          display={
            KIND_OPTIONS.find((option) => option.value === editing.decision.statementKind)?.label
          }
          mode={context.editable ? 'edit' : 'view'}
          rowIndex={row.index}
        >
          {({ stop }) => (
            <SelectEditor
              options={KIND_OPTIONS}
              stop={stop}
              value={editing.decision.statementKind}
              onSave={(next) => {
                context.update([editing.addition.id], { statementKind: next as AddKind });
              }}
            />
          )}
        </EditableCell>
      );
    },
    meta: { label: 'Save as' },
  },
  {
    id: 'category',
    header: 'Category or account',
    cell: ({ row }) => {
      const editing = editableAddition(row.original, context);
      if (editing === null) {
        return null;
      }
      const { decision, addition } = editing;
      if (decision.statementKind === 'self_transfer') {
        const options = context.accounts
          .filter((account) => account.id !== context.accountId)
          .map((account) => ({ label: account.accountName, value: account.id }));
        const current = options.find((option) => option.value === decision.counterpartyAccountId);
        return (
          <EditableCell
            columnId="category"
            display={<TransferTarget current={current} direction={addition.direction} />}
            mode={context.editable ? 'edit' : 'view'}
            rowIndex={row.index}
          >
            {({ stop }) => (
              <SelectEditor
                options={options}
                stop={stop}
                value={decision.counterpartyAccountId ?? ''}
                onSave={(next) => {
                  context.update([addition.id], { counterpartyAccountId: next });
                }}
              />
            )}
          </EditableCell>
        );
      }
      const options = context.categories.includes(decision.category)
        ? context.categories
        : [decision.category, ...context.categories].filter((category) => category !== '');
      return (
        <EditableCell
          columnId="category"
          display={decision.category === '' ? <Muted>-</Muted> : decision.category}
          mode={context.editable ? 'edit' : 'view'}
          rowIndex={row.index}
        >
          {({ stop }) => (
            <SelectEditor
              options={options}
              stop={stop}
              value={decision.category}
              onSave={(next) => {
                context.update([addition.id], { category: next });
              }}
            />
          )}
        </EditableCell>
      );
    },
    meta: { label: 'Category or account' },
  },
  {
    id: 'tags',
    header: 'Tags',
    cell: ({ row }) => {
      const editing = editableAddition(row.original, context);
      if (editing === null || editing.decision.statementKind === 'self_transfer') {
        return null;
      }
      const { decision, addition } = editing;
      return (
        <EditableCell
          columnId="tags"
          display={
            decision.tags.length === 0 ? (
              <Muted>-</Muted>
            ) : (
              <span className="flex gap-1">
                {decision.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </span>
            )
          }
          mode={context.editable ? 'edit' : 'view'}
          rowIndex={row.index}
        >
          {({ stop }) => (
            <TagsEditor
              options={context.tags}
              stop={stop}
              value={decision.tags}
              onSave={(next) => {
                context.update([addition.id], { tags: next });
              }}
            />
          )}
        </EditableCell>
      );
    },
    meta: { label: 'Tags' },
  },
];
