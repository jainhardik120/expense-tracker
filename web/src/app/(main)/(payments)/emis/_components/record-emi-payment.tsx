'use client';

import { useMemo, useState } from 'react';

import { ReceiptIndianRupee } from 'lucide-react';

import { RowActionTrigger } from '@/components/data-table/row-actions';
import { ZonedDate } from '@/components/zoned-date';
import { formatCurrency } from '@/lib/format';
import { calculateSchedule, INSTALMENT_WINDOW_DAYS } from '@/server/helpers/emi-calculations';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import type { CreditCard } from '@/types/router-outputs';

import { RecordPaymentDialog } from '../../_components/record-payment-dialog';

type Emi = RouterOutput['emis']['getEmis']['emis'][number];

const nextInstalment = (emi: Emi) => {
  const { schedule } = calculateSchedule(emi);
  if (schedule.length === 0) {
    return undefined;
  }
  const paidTill =
    emi.maxInstallmentNo === null ? schedule[0].installment - 1 : Number(emi.maxInstallmentNo);
  return schedule.find((row) => row.installment === paidTill + 1);
};

export const RecordEmiPayment = ({ emi, creditCards }: { emi: Emi; creditCards: CreditCard[] }) => {
  const [open, setOpen] = useState(false);
  const next = useMemo(() => nextInstalment(emi), [emi]);
  const mutation = api.emis.recordPayment.useMutation();
  const { data: linked } = api.emis.getLinkedStatements.useQuery(
    { emiId: emi.id },
    { enabled: open },
  );

  if (next === undefined) {
    return null;
  }

  const last = linked?.at(0);
  const cardAccountId = creditCards.find((card) => card.id === emi.creditId)?.accountId ?? '';
  const defaults =
    linked === undefined
      ? null
      : {
          statementKind: last?.statementKind ?? 'expense',
          accountId: last?.accountId ?? cardAccountId,
          friendId: last?.friendId ?? '',
          category: last?.category ?? '',
          tags: last?.tags ?? emi.tags,
          createdAt: next.date ?? new Date(),
        };
  const overdue = next.date !== undefined && next.date < new Date();

  return (
    <RecordPaymentDialog
      breakdown={{ principal: next.principal, interest: next.interest, gst: next.gst }}
      defaults={defaults}
      open={open}
      setOpen={setOpen}
      summary={
        <>
          {next.installment === 0
            ? 'Processing fee'
            : `Instalment ${String(next.installment)} of ${emi.tenure}`}{' '}
          · {formatCurrency(next.totalPayment)}
          {next.date === undefined ? null : (
            <>
              {' '}
              · due <ZonedDate value={next.date} />
            </>
          )}
          {overdue ? <span className="text-destructive font-medium"> · overdue</span> : null}
          <br />
          The statement is created already linked to this instalment, so its date has to be within{' '}
          {INSTALMENT_WINDOW_DAYS} days of the due date.
        </>
      }
      title={`Record payment: ${emi.name}`}
      trigger={<RowActionTrigger icon={ReceiptIndianRupee} label="Record payment" />}
      onRecord={(values) => mutation.mutateAsync({ ...values, emiId: emi.id })}
    />
  );
};
