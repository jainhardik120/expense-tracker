'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { toast } from 'sonner';
import { type z } from 'zod';

import DynamicForm from '@/components/dynamic-form/dynamic-form';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/format';
import { cn, errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import { createStatementSchema } from '@/types';

import { statementFormFields } from '../../statements/_components/statement-forms';

export type StatementValues = z.infer<typeof createStatementSchema>;

export type AmountBreakdown = { principal: number; interest: number; gst: number };

const PAISE_PER_RUPEE = 100;
const roundToPaise = (value: number) => Math.round(value * PAISE_PER_RUPEE) / PAISE_PER_RUPEE;
const asInput = (value: number) => roundToPaise(value).toFixed(2);
const asNumber = (value: string) => (value.trim() === '' ? 0 : Number(value));

type AmountMode = 'total' | 'breakdown';

const BREAKDOWN_PARTS = [
  { key: 'principal', label: 'Principal' },
  { key: 'interest', label: 'Interest' },
  { key: 'gst', label: 'GST on interest' },
] as const;

const AmountStep = ({
  breakdown,
  onContinue,
}: {
  breakdown: AmountBreakdown;
  onContinue: (amount: number) => void;
}) => {
  const [mode, setMode] = useState<AmountMode>('total');
  const [total, setTotal] = useState(
    asInput(breakdown.principal + breakdown.interest + breakdown.gst),
  );
  const [parts, setParts] = useState({
    principal: asInput(breakdown.principal),
    interest: asInput(breakdown.interest),
    gst: asInput(breakdown.gst),
  });
  const amount = roundToPaise(
    mode === 'total'
      ? asNumber(total)
      : asNumber(parts.principal) + asNumber(parts.interest) + asNumber(parts.gst),
  );
  const valid = Number.isFinite(amount) && amount > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted inline-flex w-fit rounded-md p-1">
        {(
          [
            ['total', 'Total amount'],
            ['breakdown', 'Principal, interest and GST'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={cn(
              'rounded px-3 py-1 text-sm transition-colors',
              mode === value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
            )}
            type="button"
            onClick={() => {
              setMode(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'total' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="record-total">Amount charged</Label>
          <Input
            id="record-total"
            inputMode="decimal"
            type="number"
            value={total}
            onChange={(event) => {
              setTotal(event.target.value);
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {BREAKDOWN_PARTS.map((part) => (
            <div key={part.key} className="flex flex-col gap-2">
              <Label htmlFor={`record-${part.key}`}>{part.label}</Label>
              <Input
                id={`record-${part.key}`}
                inputMode="decimal"
                type="number"
                value={parts[part.key]}
                onChange={(event) => {
                  setParts((current) => ({ ...current, [part.key]: event.target.value }));
                }}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <p className="text-sm">
          <span className="text-muted-foreground">Statement amount </span>
          <span className="font-semibold tabular-nums">{valid ? formatCurrency(amount) : '—'}</span>
        </p>
        <Button
          disabled={!valid}
          onClick={() => {
            onContinue(amount);
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  );
};

const StatementStep = ({
  defaults,
  amount,
  onRecord,
}: {
  defaults: Partial<StatementValues>;
  amount: number | null;
  onRecord: (values: StatementValues) => Promise<void>;
}) => {
  const { data: accounts } = api.accounts.getAccounts.useQuery();
  const { data: friends } = api.friends.getFriends.useQuery();
  const { data: categories } = api.statements.getCategories.useQuery({});
  if (accounts === undefined || friends === undefined || categories === undefined) {
    return <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>;
  }
  return (
    <DynamicForm
      defaultValues={{
        amount: '',
        category: '',
        statementKind: 'expense',
        accountId: '',
        friendId: '',
        tags: [],
        createdAt: new Date(),
        ...defaults,
        ...(amount === null ? {} : { amount: asInput(amount) }),
      }}
      fields={statementFormFields(accounts, friends, categories)}
      schema={createStatementSchema}
      showSubmitButton
      submitButtonText="Record payment"
      onSubmit={onRecord}
    />
  );
};

export const RecordPaymentDialog = ({
  open,
  setOpen,
  trigger,
  title,
  summary,
  breakdown,
  defaults,
  onRecord,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger: React.ReactNode;
  title: string;
  summary: React.ReactNode;
  breakdown?: AmountBreakdown;
  defaults: Partial<StatementValues> | null;
  onRecord: (values: StatementValues) => Promise<unknown>;
}) => {
  const router = useRouter();
  const [amount, setAmount] = useState<number | null>(null);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setAmount(null);
    }
  };
  const record = async (values: StatementValues) => {
    try {
      await onRecord(values);
      toast.success('Payment recorded and linked');
      changeOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const content = () => {
    if (defaults === null) {
      return <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>;
    }
    if (breakdown !== undefined && amount === null) {
      return <AmountStep breakdown={breakdown} onContinue={setAmount} />;
    }
    return <StatementStep amount={amount} defaults={defaults} onRecord={record} />;
  };

  return (
    <Modal
      className="sm:max-w-140"
      open={open}
      setOpen={changeOpen}
      title={title}
      trigger={trigger}
    >
      <div className="flex flex-col gap-4">
        <div className="text-muted-foreground text-sm">{summary}</div>
        {content()}
      </div>
    </Modal>
  );
};
