'use client';

import { useState } from 'react';

import { Link, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { api } from '@/server/react';
import type { Statement } from '@/types';

import { TaxableIncomeLinkOption } from './TaxableIncomeLinkOption';

type LinkType = 'recurring' | 'emi' | 'salary';

const isAlreadyLinked = (
  statement: Statement,
): { isLinked: true; type: LinkType } | { isLinked: false } => {
  const attributes = statement.additionalAttributes as Partial<Record<string, unknown>>;
  const isRecurring = attributes['recurringPaymentId'] !== undefined;
  if (isRecurring) {
    return { isLinked: true, type: 'recurring' };
  }
  const isEMI = attributes['emiId'] !== undefined;
  if (isEMI) {
    return { isLinked: true, type: 'emi' };
  }
  const isSalary = attributes['salaryPaymentId'] !== undefined;
  if (isSalary) {
    return { isLinked: true, type: 'salary' };
  }
  return { isLinked: false };
};

export const LinkToRecurringPaymentDialog = ({
  statement,
  onRefresh,
}: {
  statement: Statement;
  onRefresh: () => void;
}) => {
  const alreadyLinked = isAlreadyLinked(statement);
  return <LinkDialog alreadyLinked={alreadyLinked} statement={statement} onRefresh={onRefresh} />;
};

export const LinkDialog = ({
  statement,
  onRefresh,
  alreadyLinked,
}: {
  statement: Statement;
  onRefresh: () => void;
  alreadyLinked: ReturnType<typeof isAlreadyLinked>;
}) => {
  const [open, setOpen] = useState(false);
  const canLinkSalary =
    statement.statementKind === 'outside_transaction' && Number(statement.amount) > 0;
  const canManageTaxableIncome =
    canLinkSalary && (!alreadyLinked.isLinked || alreadyLinked.type !== 'salary');
  const finish = () => {
    setOpen(false);
    onRefresh();
  };
  return (
    <Modal
      className="sm:max-w-fit"
      description="Manage recurring payment, EMI, salary, and taxable-income associations."
      open={open}
      setOpen={setOpen}
      title="Link Statement"
      trigger={
        <Button
          className="size-8"
          size="icon"
          title={alreadyLinked.isLinked ? 'Manage statement link' : 'Link Statement'}
          variant="ghost"
        >
          {alreadyLinked.isLinked ? <Unlink className="h-4 w-4" /> : <Link className="h-4 w-4" />}
        </Button>
      }
    >
      <div className="space-y-4">
        {alreadyLinked.isLinked ? (
          <UnlinkContent statement={statement} type={alreadyLinked.type} onSuccess={finish} />
        ) : (
          <LinkToRecurringPaymentContent
            canLinkSalary={canLinkSalary}
            statementDate={statement.createdAt}
            statementId={statement.id}
            onSuccess={finish}
          />
        )}
        {canManageTaxableIncome ? (
          <TaxableIncomeLinkOption statement={statement} onSaved={finish} />
        ) : null}
      </div>
    </Modal>
  );
};

const UnlinkContent = ({
  statement,
  onSuccess,
  type,
}: {
  statement: Statement;
  onSuccess: () => void;
  type: LinkType;
}) => {
  const unlinkRecurringMutation = api.recurringPayments.unlinkStatement.useMutation();
  const unlinkEMIMutation = api.emis.unlinkStatement.useMutation();
  const unlinkSalaryMutation = api.salary.unlinkStatement.useMutation();
  const mutationByType = {
    recurring: unlinkRecurringMutation,
    emi: unlinkEMIMutation,
    salary: unlinkSalaryMutation,
  };
  const mutation = mutationByType[type];
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div>
        <div className="font-medium">Linked statement</div>
        <div className="text-muted-foreground text-sm capitalize">{type}</div>
      </div>
      <DeleteConfirmationDialog
        mutation={mutation}
        mutationInput={{
          statementId: statement.id,
        }}
        refresh={onSuccess}
      >
        <Button variant="outline">Unlink</Button>
      </DeleteConfirmationDialog>
    </div>
  );
};

const LinkToRecurringPaymentContent = ({
  statementDate,
  statementId,
  onSuccess,
  canLinkSalary,
}: {
  statementDate: Date;
  statementId: string;
  onSuccess: () => void;
  canLinkSalary: boolean;
}) => {
  const { data: recurringCandidates, isLoading: recurringLoading } =
    api.recurringPayments.getLinkCandidates.useQuery({ statementDate });
  const { data: emiCandidates, isLoading: emisLoading } = api.emis.getLinkCandidates.useQuery({
    statementId,
  });

  const linkRecurringMutation = api.recurringPayments.linkStatement.useMutation();
  const linkEMIMutation = api.emis.linkStatement.useMutation();
  const { data: salaryCandidates, isLoading: salaryLoading } =
    api.salary.getLinkCandidates.useQuery({ statementDate }, { enabled: canLinkSalary });
  const linkSalaryMutation = api.salary.linkStatement.useMutation();

  if (recurringLoading || emisLoading || (canLinkSalary && salaryLoading)) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">Loading payments...</div>
    );
  }

  const candidateCount =
    (recurringCandidates?.length ?? 0) +
    (emiCandidates?.length ?? 0) +
    (salaryCandidates?.length ?? 0);
  if (candidateCount === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No payment is due around this statement&apos;s date and amount. Completed EMIs, ended
        recurring payments, and instalments already settled are not shown.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {salaryCandidates?.map((candidate) => (
        <div
          key={`${candidate.revisionId}-${candidate.periodStart.toISOString()}`}
          className="hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-4"
        >
          <div className="space-y-1">
            <div className="font-medium">{candidate.revisionName}</div>
            <div className="text-muted-foreground text-sm">
              {formatDate(candidate.periodStart, { month: 'long', day: undefined })} ·{' '}
              {formatCurrency(candidate.totals.net)} estimated net
            </div>
          </div>
          <Button
            disabled={linkSalaryMutation.isPending}
            onClick={async () => {
              try {
                await linkSalaryMutation.mutateAsync({
                  statementId,
                  revisionId: candidate.revisionId,
                  periodStart: candidate.periodStart,
                });
                toast.success('Statement linked to salary period');
                onSuccess();
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            Link salary
          </Button>
        </div>
      ))}
      {emiCandidates?.map((candidate) => (
        <div
          key={candidate.id}
          className="hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-4"
        >
          <div className="space-y-1">
            <div className="font-medium">{candidate.name}</div>
            <div className="text-muted-foreground text-sm">
              Instalment {candidate.installmentNo} of {candidate.tenure}
              {candidate.amount === null ? null : ` · ${formatCurrency(candidate.amount)}`}
              {candidate.scheduledDate === null ? null : ` · due ${formatDate(candidate.scheduledDate)}`}
            </div>
          </div>
          <Button
            disabled={linkEMIMutation.isPending}
            onClick={async () => {
              try {
                await linkEMIMutation.mutateAsync({ emiId: candidate.id, statementId });
                toast.success('Statement linked successfully');
                onSuccess();
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            Link
          </Button>
        </div>
      ))}
      {recurringCandidates?.map((candidate) => (
        <div
          key={candidate.id}
          className="hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-4"
        >
          <div className="space-y-1">
            <div className="font-medium">{candidate.name}</div>
            <div className="text-muted-foreground text-sm">
              {candidate.category} · {formatCurrency(Number(candidate.amount))} · due{' '}
              {formatDate(candidate.scheduledDate)}
            </div>
          </div>
          <Button
            disabled={linkRecurringMutation.isPending}
            onClick={async () => {
              try {
                await linkRecurringMutation.mutateAsync({
                  recurringPaymentId: candidate.id,
                  statementId,
                });
                toast.success('Statement linked successfully');
                onSuccess();
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            Link
          </Button>
        </div>
      ))}
    </div>
  );
};
