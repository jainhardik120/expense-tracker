'use client';

import { useState } from 'react';

import { ReceiptIndianRupee } from 'lucide-react';

import { RowActionTrigger } from '@/components/data-table/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import { linkWindowDays } from '@/server/helpers/recurring-calculations';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { RecordPaymentDialog } from '../../_components/record-payment-dialog';

type RecurringPayment =
  RouterOutput['recurringPayments']['getRecurringPayments']['recurringPayments'][number];
type Details = RouterOutput['recurringPayments']['getRecurringPaymentDetails'];

const unpaidOccurrences = (details: Details): Date[] => {
  const missed = details.schedule
    .filter((entry) => entry.status === 'missed')
    .map((entry) => entry.scheduledDate);
  const upcoming =
    details.schedule.find((entry) => entry.status === 'upcoming')?.scheduledDate ??
    details.nextPaymentDate;
  return upcoming === null ? missed : [...missed, upcoming];
};

export const RecordRecurringPayment = ({ payment }: { payment: RecurringPayment }) => {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const zoned = useZonedFormat();
  const mutation = api.recurringPayments.recordPayment.useMutation();
  const { data: details } = api.recurringPayments.getRecurringPaymentDetails.useQuery(
    { recurringPaymentId: payment.id },
    { enabled: open },
  );

  const occurrences = details === undefined ? [] : unpaidOccurrences(details);
  const chosen =
    occurrences.find((date) => date.toISOString() === picked) ?? occurrences.at(0) ?? null;
  const last = details?.linkedStatements.at(0);
  const now = new Date();

  const defaults =
    details === undefined
      ? null
      : {
          statementKind: last?.statementKind ?? 'expense',
          accountId: last?.accountId ?? '',
          friendId: last?.friendId ?? '',
          category: last?.category ?? payment.category,
          tags: last?.tags ?? [],
          amount: payment.amount,
          createdAt: chosen ?? now,
        };

  const summary = () => {
    if (details === undefined) {
      return null;
    }
    if (chosen === null) {
      return <p>Nothing is due on this payment, so there is no date to suggest.</p>;
    }
    const missedCount = occurrences.filter((date) => date < now).length;
    return (
      <div className="flex flex-col gap-3">
        <p>
          {formatCurrency(payment.amount)} every time.
          {missedCount > 0 ? (
            <span className="text-destructive font-medium">
              {' '}
              {missedCount === 1 ? 'One payment is' : `${String(missedCount)} payments are`}{' '}
              overdue.
            </span>
          ) : null}{' '}
          The statement is created already linked to this payment, so its date has to be within{' '}
          {Math.floor(linkWindowDays(payment))} days of the due date.
        </p>
        {occurrences.length > 1 ? (
          <Select
            value={chosen.toISOString()}
            onValueChange={(value) => {
              setPicked(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {occurrences.map((date) => (
                <SelectItem key={date.toISOString()} value={date.toISOString()}>
                  Due {zoned(date, DATE_FORMAT.date)}
                  {date < now ? ' · overdue' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p>Due {zoned(chosen, DATE_FORMAT.date)}</p>
        )}
      </div>
    );
  };

  return (
    <RecordPaymentDialog
      defaults={defaults}
      open={open}
      setOpen={(next) => {
        setOpen(next);
        if (!next) {
          setPicked(null);
        }
      }}
      summary={summary()}
      title={`Record payment: ${payment.name}`}
      trigger={<RowActionTrigger icon={ReceiptIndianRupee} label="Record payment" />}
      onRecord={(values) => mutation.mutateAsync({ ...values, recurringPaymentId: payment.id })}
    />
  );
};
