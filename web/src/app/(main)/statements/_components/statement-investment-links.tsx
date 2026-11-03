'use client';

import { Unlink } from 'lucide-react';
import { toast } from 'sonner';

import {
  LinkCandidate,
  PAISA,
} from '@/app/(main)/investments/_components/investment-payments-dialog';
import { Button } from '@/components/ui/button';
import { ZonedDate } from '@/components/zoned-date';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import { investmentKindLabels, normalizeInvestmentKind } from '@/lib/investments';
import { api } from '@/server/react';

const describe = (investment: { name: string | null; code: string | null; kind: string }) =>
  investment.name ??
  investment.code ??
  investmentKindLabels[normalizeInvestmentKind(investment.kind)];

export const StatementInvestmentLinks = ({
  statementId,
  onChanged,
}: {
  statementId: string;
  onChanged: () => void;
}) => {
  const utils = api.useUtils();
  const { data, isLoading } = api.investments.payments.getForStatement.useQuery({ statementId });
  const refresh = async () => {
    await utils.investments.payments.getForStatement.invalidate({ statementId });
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
      <div className="text-muted-foreground py-4 text-center text-sm">Loading investments...</div>
    );
  }

  const hasRemaining = data.remaining > PAISA;
  const suggestFor = (candidate: { investmentAmount: number; alreadyPaid: number }) => {
    const unpaid = Math.max(candidate.investmentAmount - candidate.alreadyPaid, 0);
    return unpaid > 0 ? Math.min(data.remaining, unpaid) : data.remaining;
  };
  const candidateList =
    data.candidates.length === 0 ? (
      <div className="text-muted-foreground text-center text-sm">
        No investments from 10 days before to 6 months after this payment.
      </div>
    ) : (
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {data.candidates.map((candidate) => (
          <LinkCandidate
            key={candidate.id}
            detail={
              <>
                {formatCurrency(candidate.investmentAmount)} on{' '}
                <ZonedDate pattern={DATE_FORMAT.date} value={candidate.investmentDate} />
                {candidate.alreadyPaid > 0
                  ? ` · ${formatCurrency(candidate.alreadyPaid)} already linked`
                  : ''}
              </>
            }
            label={describe(candidate)}
            pending={linkMutation.isPending}
            suggested={suggestFor(candidate)}
            onLink={(amount) => {
              linkMutation.mutate({ investmentId: candidate.id, statementId, amount });
            }}
          />
        ))}
      </div>
    );

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium">Investments funded</div>
        <div className="text-muted-foreground text-sm tabular-nums">
          {formatCurrency(data.allocated)} of {formatCurrency(data.statement.amount)} linked
          {hasRemaining ? ` · ${formatCurrency(data.remaining)} left` : ''}
        </div>
      </div>
      {data.links.map((link) => (
        <div key={link.id} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{describe(link.investment)}</div>
            <div className="text-muted-foreground text-xs tabular-nums">
              {formatCurrency(link.amount)} paid ·{' '}
              {formatCurrency(link.investment.investmentAmount)} invested on{' '}
              <ZonedDate pattern={DATE_FORMAT.date} value={link.investment.investmentDate} />
            </div>
          </div>
          <Button
            aria-label="Unlink investment"
            disabled={unlinkMutation.isPending}
            size="icon"
            variant="ghost"
            onClick={() => {
              unlinkMutation.mutate({ id: link.id });
            }}
          >
            <Unlink />
          </Button>
        </div>
      ))}
      {hasRemaining ? candidateList : null}
    </div>
  );
};
