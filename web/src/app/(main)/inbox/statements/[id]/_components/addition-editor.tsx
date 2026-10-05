'use client';

import { useId, useState } from 'react';

import { Autocomplete } from '@/components/ui/autocomplete';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type RouterOutput } from '@/server/routers';

import { cleanDescription, formatShortDay } from '../../../_components/statement-labels';

type Review = RouterOutput['statementImports']['getReview'];
type Addition = Extract<Review['suggestions'][number], { type: 'add' | 'add_difference' }>;
type LedgerRow = Review['ledger'][string];
type AddKind = Addition['defaults']['statementKind'];

export type Decision = {
  accepted: boolean;
  mode: 'new' | 'fold';
  statementKind: AddKind;
  category: string;
  tags: string[];
  counterpartyAccountId: string | null;
};

const KIND_LABELS: Record<AddKind, string> = {
  expense: 'Expense',
  outside_transaction: 'Income or refund',
  self_transfer: 'Transfer',
};

const TagsField = ({
  tags,
  onChange,
  disabled,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled: boolean;
}) => {
  const [text, setText] = useState(tags.join(', '));
  return (
    <Input
      disabled={disabled}
      placeholder="Tags, comma separated"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag !== ''),
        );
      }}
    />
  );
};

export const AdditionEditor = ({
  suggestion,
  decision,
  onChange,
  disabled,
  accounts,
  accountId,
  categories,
  foldTarget,
}: {
  suggestion: Addition;
  decision: Decision;
  onChange: (change: Partial<Decision>) => void;
  disabled: boolean;
  accounts: Array<{ id: string; accountName: string }>;
  accountId: string;
  categories: string[];
  foldTarget: LedgerRow | undefined;
}) => {
  const folding = decision.mode === 'fold' && foldTarget !== undefined;
  const acceptId = useId();
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3 text-sm',
        !decision.accepted && 'opacity-60',
      )}
    >
      <label className="flex items-start gap-3" htmlFor={acceptId}>
        <Checkbox
          checked={decision.accepted}
          className="mt-0.5"
          disabled={disabled}
          id={acceptId}
          onCheckedChange={(value) => {
            onChange({ accepted: value === true });
          }}
        />
        <span className="flex flex-1 flex-wrap items-center justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{cleanDescription(suggestion.description)}</span>
            <span className="text-muted-foreground text-xs">
              {formatShortDay(suggestion.date)}
              {suggestion.smsId === null ? null : (
                <Badge className="ml-2" variant="outline">
                  Pending SMS found
                </Badge>
              )}
            </span>
          </span>
          <span
            className={cn(
              'font-medium tabular-nums',
              suggestion.direction === 'credit' && 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {suggestion.direction === 'credit' ? '+' : ''}
            {formatCurrency(suggestion.amount)}
          </span>
        </span>
      </label>
      {decision.accepted ? (
        <div className="flex flex-col gap-2 pl-7">
          {foldTarget === undefined ? null : (
            <Select
              disabled={disabled}
              value={decision.mode}
              onValueChange={(mode) => {
                onChange({ mode: mode === 'fold' ? 'fold' : 'new' });
              }}
            >
              <SelectTrigger className="w-full md:w-96">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fold">
                  Add to “{foldTarget.label}” {formatCurrency(foldTarget.amount)} on{' '}
                  {formatShortDay(foldTarget.date)}
                </SelectItem>
                <SelectItem value="new">Save as its own row</SelectItem>
              </SelectContent>
            </Select>
          )}
          {folding ? null : (
            <div className="grid gap-2 md:grid-cols-[10rem_1fr_1fr]">
              <Select
                disabled={disabled}
                value={decision.statementKind}
                onValueChange={(kind) => {
                  onChange({ statementKind: kind as AddKind });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as AddKind[]).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {decision.statementKind === 'self_transfer' ? (
                <Select
                  disabled={disabled}
                  value={decision.counterpartyAccountId ?? ''}
                  onValueChange={(value) => {
                    onChange({ counterpartyAccountId: value });
                  }}
                >
                  <SelectTrigger className="w-full md:col-span-2">
                    <SelectValue
                      placeholder={
                        suggestion.direction === 'credit'
                          ? 'Paid from which account?'
                          : 'Sent to which account?'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((account) => account.id !== accountId)
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {suggestion.direction === 'credit' ? 'From ' : 'To '}
                          {account.accountName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Autocomplete
                    disabled={disabled}
                    options={categories.map((category) => ({ value: category, label: category }))}
                    placeholder="Category"
                    value={decision.category}
                    onValueChange={(category) => {
                      onChange({ category });
                    }}
                  />
                  <TagsField
                    disabled={disabled}
                    tags={decision.tags}
                    onChange={(tags) => {
                      onChange({ tags });
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
