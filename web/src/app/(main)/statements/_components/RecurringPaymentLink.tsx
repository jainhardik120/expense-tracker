'use client';

import { useState } from 'react';

import { Link, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import type { CreditCardAccount, Emi, RecurringPayment, Statement } from '@/types';

const isAlreadyLinked = (
  statement: Statement,
): { isLinked: true; type: 'recurring' | 'emi' } | { isLinked: false } => {
  const attributes = statement.additionalAttributes as Partial<Record<string, unknown>>;
  const isRecurring = attributes['recurringPaymentId'] !== undefined;
  if (isRecurring) {
    return { isLinked: true, type: 'recurring' };
  }
  const isEMI = attributes['emiId'] !== undefined;
  if (isEMI) {
    return { isLinked: true, type: 'emi' };
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
  if (alreadyLinked.isLinked) {
    return <UnlinkDialog statement={statement} type={alreadyLinked.type} onRefresh={onRefresh} />;
  }
  return <LinkDialog creditAccounts={creditAccounts} statement={statement} onRefresh={onRefresh} />;
};

export const LinkDialog = ({
  statement,
  creditAccounts,
  onRefresh,
}: {
  statement: Statement;
  creditAccounts: CreditCardAccount[];
  onRefresh: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const creditCard = creditAccounts.find((cc) => cc.accountId === statement.accountId);
  return (
    <Modal
      className="sm:max-w-fit"
      description="Select a recurring payment or EMI to link with this statement"
      open={open}
      setOpen={setOpen}
      title="Link Statement"
      trigger={
        <Button className="size-8" size="icon" title="Link Statement" variant="ghost">
          <Link className="h-4 w-4" />
        </Button>
      }
    >
      <LinkToRecurringPaymentContent
        creditId={creditCard?.id}
        statementId={statement.id}
        onSuccess={() => {
          setOpen(false);
          onRefresh();
        }}
      />
    </Modal>
  );
};

const UnlinkDialog = ({
  statement,
  onRefresh,
  type,
}: {
  statement: Statement;
  onRefresh: () => void;
  type: 'recurring' | 'emi';
}) => {
  const unlinkRecurringMutation = api.recurringPayments.unlinkStatement.useMutation();
  const unlinkEMIMutation = api.emis.unlinkStatement.useMutation();
  return (
    <DeleteConfirmationDialog
      mutation={type === 'recurring' ? unlinkRecurringMutation : unlinkEMIMutation}
      mutationInput={{
        statementId: statement.id,
      }}
      refresh={onRefresh}
    >
      <Button className="size-8" size="icon" title="Unlink from Recurring Payment" variant="ghost">
        <Unlink className="h-4 w-4" />
      </Button>
    </DeleteConfirmationDialog>
  );
};

const isEMI = (rp: RecurringPayment | Emi): rp is Emi => 'creditId' in rp;

const LinkToRecurringPaymentContent = ({
  creditId,
  statementId,
  onSuccess,
}: {
  creditId?: string;
  statementId: string;
  onSuccess: () => void;
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

  if (recurringLoading || emisLoading) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">Loading payments...</div>
    );
  }

  if (recurringPaymentsData === undefined || recurringPaymentsData.recurringPayments.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No recurring payments found. Create one in the Recurring Payments section.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {[recurringPaymentsData.recurringPayments, emisData?.emis ?? []].flat().map((rp) => (
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
                toast.success('Statement linked to EMI successfully');
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
