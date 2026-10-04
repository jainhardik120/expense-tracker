import { useMemo, useState } from 'react';

import { SquareSlash } from 'lucide-react';
import { toast } from 'sonner';
import { type z } from 'zod';

import { DataTableActionBarAction } from '@/components/data-table/data-table-action-bar';
import DynamicForm from '@/components/dynamic-form/dynamic-form';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatPercent, formatCurrency } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import {
  type SelfTransferStatement,
  createSplitSchema,
  isSelfTransfer,
  type Statement,
  bulkSplitSchema,
  PERCENTAGE_DIVISOR,
} from '@/types';

const createAmountSplitFields = (
  friends: Array<{ id: string; name: string }>,
): FormField<z.infer<typeof createSplitSchema>>[] => [
  {
    name: 'amount',
    label: 'Amount',
    type: 'number',
    placeholder: 'Amount',
  },
  {
    name: 'friendId',
    label: 'Friend ID',
    type: 'select',
    placeholder: 'Select Friend',
    options: friends.map((friend) => ({
      label: friend.name,
      value: friend.id,
    })),
  },
];

const createPercentageSplitFields = (
  friends: Array<{ id: string; name: string }>,
): FormField<z.infer<typeof bulkSplitSchema>>[] => [
  {
    name: 'percentage',
    label: 'Percentage',
    type: 'number',
    placeholder: 'Percentage',
  },
  {
    name: 'friendId',
    label: 'Friend ID',
    type: 'select',
    placeholder: 'Select Friend',
    options: friends.map((friend) => ({
      label: friend.name,
      value: friend.id,
    })),
  },
];

export const StatementSplitsDialog = ({
  statementId,
  statementData,
  trigger,
}: {
  statementId: string;
  statementData: Statement;
  trigger: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const { data: friends = [] } = api.friends.getFriends.useQuery(undefined, { enabled: open });
  const { data: splits = [], refetch } = api.statements.getStatementSplits.useQuery(
    {
      id: statementId,
    },
    {
      enabled: open,
    },
  );
  const updateSplitMutation = api.statements.updateStatementSplit.useMutation();
  const createSplitMutation = api.statements.addStatementSplit.useMutation();
  const handleSubmit = async (splitId: string, values: z.infer<typeof createSplitSchema>) => {
    try {
      if (splitId === 'new-split') {
        await createSplitMutation.mutateAsync({
          statementId: statementId,
          createSplitSchema: values,
        });
      } else {
        await updateSplitMutation.mutateAsync({
          splitId: splitId,
          createSplitSchema: values,
        });
      }
      return refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Statement Splits</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p>Total Amount: {formatCurrency(statementData.amount)}</p>
          {statementData.accountName !== null && <p>Paid From: {statementData.accountName}</p>}
          {statementData.friendName !== null && <p>Paid By: {statementData.friendName}</p>}
          {[...splits, { id: 'new-split', amount: '0', friendId: '' }].map((split) => {
            return (
              <DynamicForm
                key={split.id}
                className="w-full grid-cols-2 items-end"
                defaultValues={{
                  amount: split.amount,
                  friendId: split.friendId,
                }}
                fields={createAmountSplitFields(friends)}
                schema={createSplitSchema}
                showSubmitButton
                submitButtonDisabled={updateSplitMutation.isPending}
                submitButtonText={split.id === 'new-split' ? 'Add Split' : 'Update Split'}
                onSubmit={(values) => {
                  void handleSubmit(split.id, values);
                }}
              />
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const BulkStatementSplitsDialog = ({
  selectedRows,
}: {
  selectedRows: (Statement | SelfTransferStatement)[];
}) => {
  const { data: friends = [] } = api.friends.getFriends.useQuery();
  const bulkSplitConditions = useMemo(():
    | { allowed: false }
    | { allowed: true; maxPercentage: number } => {
    const isAnyNotExpense = selectedRows.some(
      (row) => isSelfTransfer(row) || row.statementKind !== 'expense',
    );
    if (isAnyNotExpense) {
      return { allowed: false };
    }
    let maxPercentage = 100;
    selectedRows.forEach((row) => {
      if (isSelfTransfer(row)) {
        return;
      }
      const percentage =
        PERCENTAGE_DIVISOR - (row.splitAmount / parseFloat(row.amount)) * PERCENTAGE_DIVISOR;
      if (percentage < maxPercentage) {
        maxPercentage = percentage;
      }
    });
    return { allowed: true, maxPercentage };
  }, [selectedRows]);
  const mutation = api.statements.addBulkStatementSplits.useMutation();
  return (
    <MutationModal
      button={
        <DataTableActionBarAction disabled={!bulkSplitConditions.allowed} size="icon">
          <SquareSlash />
        </DataTableActionBarAction>
      }
      customDescription={
        bulkSplitConditions.allowed ? (
          <p>
            You can apply a bulk split up to {formatPercent(bulkSplitConditions.maxPercentage)} for
            the selected statements.
          </p>
        ) : (
          <p className="text-red-600">Bulk splits cannot be applied to self-transfer statements.</p>
        )
      }
      defaultValues={{
        percentage: '0',
        friendId: '',
      }}
      fields={createPercentageSplitFields(friends)}
      mapInput={(values) => ({
        statementIds: selectedRows.map((row) => row.id),
        bulkSplitSchema: values,
      })}
      mutation={mutation}
      schema={bulkSplitSchema}
      successToast={() => 'Bulk splits applied successfully.'}
      titleText="Bulk Statement Splits"
    />
  );
};
