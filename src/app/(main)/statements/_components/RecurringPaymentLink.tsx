'use client';

import { useState } from 'react';

import { Link, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { api } from '@/server/react';
import { type Statement } from '@/types';

/**
 * Check if a statement is linked to a recurring payment
 */
const hasLinkedRecurringPayment = (statement: Statement): boolean => {
  const attributes = statement.additionalAttributes as Partial<Record<string, unknown>>;
  return attributes['recurringPaymentId'] !== undefined;
};

export const LinkToRecurringPaymentDialog = ({
  statement,
  onRefresh,
}: {
  statement: Statement;
  onRefresh: () => void;
}) => {
  if (hasLinkedRecurringPayment(statement)) {
    return <UnlinkDialog statement={statement} onRefresh={onRefresh} />;
  }
  return <LinkDialog statement={statement} onRefresh={onRefresh} />;
};

const LinkDialog = ({
  statement,
  onRefresh,
}: {
  statement: Statement;
  onRefresh: () => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Modal
      className="sm:max-w-fit"
      description="Select a recurring payment to link with this statement"
      open={open}
      setOpen={setOpen}
      title="Link Statement to Recurring Payment"
      trigger={
        <Button className="size-8" size="icon" title="Link to Recurring Payment" variant="ghost">
          <Link className="h-4 w-4" />
        </Button>
      }
    >
      <LinkToRecurringPaymentContent
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
}: {
  statement: Statement;
  onRefresh: () => void;
}) => {
  const mutation = api.recurringPayments.unlinkStatement.useMutation();
  return (
    <DeleteConfirmationDialog
      mutation={mutation}
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

const LinkToRecurringPaymentContent = ({
  statementId,
  onSuccess,
}: {
  statementId: string;
  onSuccess: () => void;
}) => {
  const { data: recurringPaymentsData, isLoading } =
    api.recurringPayments.getRecurringPayments.useQuery({
      page: 1,
      perPage: 100,
      category: [],
      frequency: [],
    });

  const linkMutation = api.recurringPayments.linkStatement.useMutation({
    onSuccess: () => {
      toast.success('Statement linked to recurring payment successfully');
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        Loading recurring payments...
      </div>
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
      {recurringPaymentsData.recurringPayments.map((rp) => (
        <div
          key={rp.id}
          className="hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-4"
        >
          <div className="space-y-1">
            <div className="font-medium">{rp.name}</div>
            <div className="text-muted-foreground text-sm">
              {formatCurrency(rp.amount)} | {rp.frequency} | Start: {formatDate(rp.startDate)}
            </div>
            <div className="text-muted-foreground text-xs">Category: {rp.category}</div>
          </div>
          <Button
            disabled={linkMutation.isPending}
            onClick={() => {
              linkMutation.mutate({
                recurringPaymentId: rp.id,
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
