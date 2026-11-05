'use client';

import { useState } from 'react';

import { Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import Modal, { type DialogControl } from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ZonedDate } from '@/components/zoned-date';
import { DATE_FORMAT, formatCurrency, formatPercent } from '@/lib/format';
import { api } from '@/server/react';
import { PERCENTAGE_DIVISOR } from '@/types';

const FEE_PERCENT_DECIMALS = 3;
const NO_ACCOUNT = 'No account';
export const PAISA = 0.005;

const Stat = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div className="min-w-0 rounded-lg border px-3 py-2">
    <div className="text-muted-foreground text-xs">{label}</div>
    <div className={`truncate text-sm font-medium tabular-nums ${tone ?? ''}`}>{value}</div>
  </div>
);

const LinkCandidate = ({
  label,
  detail,
  suggested,
  onLink,
  pending,
}: {
  label: React.ReactNode;
  detail: React.ReactNode;
  suggested: number;
  onLink: (amount: string) => void;
  pending: boolean;
}) => {
  const [value, setValue] = useState(suggested.toFixed(2));
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{label}</div>
        <div className="text-muted-foreground text-xs">{detail}</div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          className="w-28 tabular-nums"
          inputMode="decimal"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <Button
          disabled={pending}
          size="sm"
          variant="outline"
          onClick={() => {
            onLink(value);
          }}
        >
          <Link2 />
          Link
        </Button>
      </div>
    </div>
  );
};

export { LinkCandidate };

const PaymentsContent = ({
  investmentId,
  onChanged,
}: {
  investmentId: string;
  onChanged: () => void;
}) => {
  const utils = api.useUtils();
  const { data, isLoading } = api.investments.payments.getForInvestment.useQuery({ investmentId });
  const { data: candidates } = api.investments.payments.getPaymentCandidates.useQuery({
    investmentId,
  });
  const refresh = async () => {
    await Promise.all([
      utils.investments.payments.getForInvestment.invalidate({ investmentId }),
      utils.investments.payments.getPaymentCandidates.invalidate({ investmentId }),
    ]);
    onChanged();
  };
  const linkMutation = api.investments.payments.link.useMutation({
    onSuccess: refresh,
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const unlinkMutation = api.investments.payments.unlink.useMutation({
    onSuccess: refresh,
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (isLoading || data === undefined) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">Loading payments...</div>
    );
  }

  const { summary, payments, proceeds, investment } = data;
  const paymentCandidates = candidates?.payments ?? [];
  const proceedsCandidates = candidates?.proceeds ?? [];
  const stillToReceive = Math.max((investment.closedAmount ?? 0) - (summary.received ?? 0), 0);
  let netResultTone: string | undefined;
  if (summary.netResult !== null) {
    netResultTone = summary.netResult >= 0 ? 'text-green-600' : 'text-red-600';
  }
  const stillToPay = Math.max(summary.invested - summary.paid, 0);
  const feeShare =
    summary.feePercentage === null
      ? ''
      : ` · ${formatPercent(summary.feePercentage * PERCENTAGE_DIVISOR, FEE_PERCENT_DECIMALS)}`;
  const feesLabel = summary.fees === null ? '—' : `${formatCurrency(summary.fees)}${feeShare}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Paid" value={payments.length === 0 ? '—' : formatCurrency(summary.paid)} />
        <Stat label="Invested" value={formatCurrency(summary.invested)} />
        <Stat
          label="Fees"
          tone={summary.fees !== null && summary.fees > 0 ? 'text-red-600' : undefined}
          value={feesLabel}
        />
        <Stat
          label="Money out → invested"
          value={summary.daysToInvest === null ? '—' : `${summary.daysToInvest} days`}
        />
      </div>
      {investment.isClosed ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Closed for"
            value={investment.closedAmount === null ? '—' : formatCurrency(investment.closedAmount)}
          />
          <Stat
            label="Received"
            value={summary.received === null ? '—' : formatCurrency(summary.received)}
          />
          <Stat
            label="Net result"
            tone={netResultTone}
            value={summary.netResult === null ? '—' : formatCurrency(summary.netResult)}
          />
          <Stat
            label="Closed on"
            value={
              investment.closedAt === null ? (
                '—'
              ) : (
                <ZonedDate pattern={DATE_FORMAT.date} value={investment.closedAt} />
              )
            }
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-sm font-medium">Linked payments</div>
        {payments.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
            No payment linked yet.
          </div>
        ) : (
          payments.map((payment) => (
            <div key={payment.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium tabular-nums">
                  {formatCurrency(payment.amount)}
                </div>
                <div className="text-muted-foreground text-xs">
                  <ZonedDate pattern={DATE_FORMAT.dateTime} value={payment.spentAt} /> ·{' '}
                  {payment.accountName ?? NO_ACCOUNT}
                  {payment.statementAmount - payment.amount > PAISA
                    ? ` · part of ${formatCurrency(payment.statementAmount)}`
                    : ''}
                </div>
              </div>
              <Button
                aria-label="Unlink payment"
                disabled={unlinkMutation.isPending}
                size="icon"
                variant="ghost"
                onClick={() => {
                  unlinkMutation.mutate({ id: payment.id });
                }}
              >
                <Unlink />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Link a payment</div>
        <div className="text-muted-foreground text-xs">
          Investment payments from 6 months before to 10 days after{' '}
          <ZonedDate pattern={DATE_FORMAT.date} value={investment.investmentDate} /> with money
          still unlinked. Enter how much of each went into this investment, fees included.
        </div>
        {paymentCandidates.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
            No unlinked investment payments around this date.
          </div>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {paymentCandidates.map((candidate) => (
              <LinkCandidate
                key={candidate.id}
                detail={
                  <>
                    <ZonedDate pattern={DATE_FORMAT.dateTime} value={candidate.createdAt} /> ·{' '}
                    {candidate.accountName ?? NO_ACCOUNT}
                    {candidate.remaining < candidate.amount
                      ? ` · ${formatCurrency(candidate.remaining)} of ${formatCurrency(candidate.amount)} left`
                      : ''}
                  </>
                }
                label={formatCurrency(candidate.amount)}
                pending={linkMutation.isPending}
                suggested={Math.min(
                  candidate.remaining,
                  stillToPay > 0 ? stillToPay : candidate.remaining,
                )}
                onLink={(amount) => {
                  linkMutation.mutate({ investmentId, statementId: candidate.id, amount });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {investment.isClosed || proceeds.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">Money received</div>
          {proceeds.map((proceed) => (
            <div key={proceed.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-green-600 tabular-nums">
                  +{formatCurrency(proceed.amount)}
                </div>
                <div className="text-muted-foreground text-xs">
                  <ZonedDate pattern={DATE_FORMAT.dateTime} value={proceed.receivedAt} /> ·{' '}
                  {proceed.accountName ?? NO_ACCOUNT}
                  {proceed.statementAmount - proceed.amount > PAISA
                    ? ` · part of ${formatCurrency(proceed.statementAmount)}`
                    : ''}
                </div>
              </div>
              <Button
                aria-label="Unlink received money"
                disabled={unlinkMutation.isPending}
                size="icon"
                variant="ghost"
                onClick={() => {
                  unlinkMutation.mutate({ id: proceed.id });
                }}
              >
                <Unlink />
              </Button>
            </div>
          ))}
          {proceedsCandidates.length === 0 && proceeds.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              No incoming investment money around the close date.
            </div>
          ) : null}
          {proceedsCandidates.length === 0 ? null : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {proceedsCandidates.map((candidate) => (
                <LinkCandidate
                  key={candidate.id}
                  detail={
                    <>
                      <ZonedDate pattern={DATE_FORMAT.dateTime} value={candidate.createdAt} /> ·{' '}
                      {candidate.accountName ?? NO_ACCOUNT}
                      {candidate.remaining < candidate.amount
                        ? ` · ${formatCurrency(candidate.remaining)} of ${formatCurrency(candidate.amount)} left`
                        : ''}
                    </>
                  }
                  label={`+${formatCurrency(candidate.amount)}`}
                  pending={linkMutation.isPending}
                  suggested={Math.min(
                    candidate.remaining,
                    stillToReceive > 0 ? stillToReceive : candidate.remaining,
                  )}
                  onLink={(amount) => {
                    linkMutation.mutate({ investmentId, statementId: candidate.id, amount });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export const InvestmentPaymentsDialog = ({
  investmentId,
  title,
  dialog,
  onChanged,
}: {
  investmentId: string;
  title: string;
  dialog: DialogControl;
  onChanged: () => void;
}) => {
  const { open, onOpenChange } = dialog;
  return (
    <Modal
      className="sm:max-w-2xl"
      description="The payments that funded this investment, and what was lost to fees on the way."
      open={open}
      setOpen={onOpenChange}
      title={title}
    >
      {open ? <PaymentsContent investmentId={investmentId} onChanged={onChanged} /> : null}
    </Modal>
  );
};
