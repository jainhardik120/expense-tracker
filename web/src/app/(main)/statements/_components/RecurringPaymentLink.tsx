'use client';

import { useState } from 'react';

import { Link, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { api } from '@/server/react';
import type { CreditCardAccount, Emi, RecurringPayment, Statement } from '@/types';

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
  creditAccounts,
  onRefresh,
}: {
  statement: Statement;
  creditAccounts: CreditCardAccount[];
  onRefresh: () => void;
}) => {
  const alreadyLinked = isAlreadyLinked(statement);
  return (
    <LinkDialog
      alreadyLinked={alreadyLinked}
      creditAccounts={creditAccounts}
      statement={statement}
      onRefresh={onRefresh}
    />
  );
};

export const LinkDialog = ({
  statement,
  creditAccounts,
  onRefresh,
  alreadyLinked,
}: {
  statement: Statement;
  creditAccounts: CreditCardAccount[];
  onRefresh: () => void;
  alreadyLinked: ReturnType<typeof isAlreadyLinked>;
}) => {
  const [open, setOpen] = useState(false);
  const creditCard = creditAccounts.find((cc) => cc.accountId === statement.accountId);
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
            creditId={creditCard?.id}
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

const isEMI = (rp: RecurringPayment | Emi): rp is Emi => 'creditId' in rp;

const LinkToRecurringPaymentContent = ({
  creditId,
  statementDate,
  statementId,
  onSuccess,
  canLinkSalary,
}: {
  creditId?: string;
  statementDate: Date;
  statementId: string;
  onSuccess: () => void;
  canLinkSalary: boolean;
}) => {
  const { data: recurringPaymentsData, isLoading: recurringLoading } =
    api.recurringPayments.getRecurringPayments.useQuery({
      page: 1,
      perPage: 100,
      category: [],
      frequency: [],
    });
  const { data: emisData, isLoading: emisLoading } = api.emis.getEmis.useQuery(
    {
      creditId: [creditId ?? ''],
      page: 1,
      perPage: 100,
    },
    {
      enabled: creditId !== undefined,
    },
  );

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

  const paymentOptions = [
    recurringPaymentsData?.recurringPayments ?? [],
    emisData?.emis ?? [],
  ].flat();
  if (paymentOptions.length === 0 && (salaryCandidates?.length ?? 0) === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No link targets found. Create a recurring payment, EMI, or salary revision first.
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
      {paymentOptions.map((rp) => (
        <div
          key={rp.id}
          className="hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-4"
        >
          <div className="space-y-1">
            <div className="font-medium">{rp.name}</div>
          </div>
          <Button
            disabled={linkRecurringMutation.isPending || linkEMIMutation.isPending}
            onClick={async () => {
              try {
                if (isEMI(rp)) {
                  await linkEMIMutation.mutateAsync({
                    emiId: rp.id,
                    statementId,
                  });
                } else {
                  await linkRecurringMutation.mutateAsync({
                    recurringPaymentId: rp.id,
                    statementId,
                  });
                }
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
