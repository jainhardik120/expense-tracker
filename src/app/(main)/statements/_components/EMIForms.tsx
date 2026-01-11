'use client';

import { useState } from 'react';

import { Link, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type Statement, type CreditCardAccount } from '@/types';

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
  if (creditCard === undefined) {
    return null;
  }
  return (
    <Modal
      className="sm:max-w-fit"
      description="Select an EMI to link with this statement"
      open={open}
      setOpen={setOpen}
      title="Link Statement to EMI"
      trigger={
        <Button className="size-8" size="icon" variant="ghost">
          <Link className="h-4 w-4" />
        </Button>
      }
    >
      <LinkToEMIContent
        creditId={creditCard.id}
        statementId={statement.id}
        onSuccess={() => {
          setOpen(false);
          onRefresh();
        }}
      />
    </Modal>
  );
};

export const UnlinkDialog = ({
  statement,
  onRefresh,
}: {
  statement: Statement;
  onRefresh: () => void;
}) => {
  const mutation = api.emis.unlinkStatement.useMutation();
  return (
    <DeleteConfirmationDialog
      mutation={mutation}
      mutationInput={{
        statementId: statement.id,
      }}
      refresh={onRefresh}
    >
      <Button className="size-8" size="icon" variant="ghost">
        <Unlink className="h-4 w-4" />
      </Button>
    </DeleteConfirmationDialog>
  );
};

export const LinkToEMIDialog = ({
  statement,
  creditAccounts,
  onRefresh,
}: {
  statement: Statement;
  creditAccounts: CreditCardAccount[];
  onRefresh: () => void;
}) => {
  const existingEMI =
    (statement.additionalAttributes as Partial<Record<string, unknown>>)['emiId'] !== undefined;

  if (!existingEMI) {
    return (
      <LinkDialog creditAccounts={creditAccounts} statement={statement} onRefresh={onRefresh} />
    );
  }
  return <UnlinkDialog statement={statement} onRefresh={onRefresh} />;
};

const LinkToEMIContent = ({
  creditId,
  statementId,
  onSuccess,
}: {
  creditId: string;
  statementId: string;
  onSuccess: () => void;
}) => {
  const { data: emisData, isLoading } = api.emis.getEmis.useQuery({
    creditId: [creditId],
    page: 1,
    perPage: 100,
  });

  const linkMutation = api.emis.linkStatement.useMutation({
    onSuccess: () => {
      toast.success('Statement linked to EMI successfully');
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground py-8 text-center text-sm">Loading EMIs...</div>;
  }

  if (emisData === undefined || emisData.emis.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No EMIs found for this credit card
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {emisData.emis.map((emi) => (
        <div
          key={emi.id}
          className="hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-4"
        >
          <div className="space-y-1">
            <div className="font-medium">{emi.name}</div>
            <div className="text-muted-foreground text-sm">
              Principal: ₹{parseFloat(emi.principal).toFixed(2)} | Tenure: {emi.tenure} months |
              Rate: {emi.annualInterestRate}%
            </div>
          </div>
          <Button
            disabled={linkMutation.isPending}
            onClick={() => {
              linkMutation.mutate({
                emiId: emi.id,
                statementId,
              });
            }}
          >
            Link
          </Button>
        </div>
      ))}
    </div>
  );
};
