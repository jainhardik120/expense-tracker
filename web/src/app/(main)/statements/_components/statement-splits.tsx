import { useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { SquareSlash, Trash } from 'lucide-react';
import { toast } from 'sonner';
import { type z } from 'zod';

import { DataTableActionBarAction } from '@/components/data-table/data-table-action-bar';
import DynamicForm from '@/components/dynamic-form/dynamic-form';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newSplitKey, setNewSplitKey] = useState(0);
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
  const createSplitMutation = api.statements.createStatementSplit.useMutation();
  const deleteSplitMutation = api.statements.deleteStatementSplit.useMutation();
  const runSplitChange = async (change: () => Promise<unknown>, successMessage: string) => {
    try {
      await change();
      await refetch();
      router.refresh();
      toast.success(successMessage);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  };
  const handleAddSplit = async (values: z.infer<typeof createSplitSchema>) => {
    const added = await runSplitChange(
      () => createSplitMutation.mutateAsync({ statementId, createSplitSchema: values }),
      'Split added',
    );
    if (added) {
      setNewSplitKey((key) => key + 1);
    }
  };
  const handleUpdateSplit = (splitId: string, values: z.infer<typeof createSplitSchema>) =>
    runSplitChange(
      () => updateSplitMutation.mutateAsync({ splitId, createSplitSchema: values }),
      'Split updated',
    );
  const handleDeleteSplit = (splitId: string) =>
    runSplitChange(() => deleteSplitMutation.mutateAsync({ splitId }), 'Split deleted');
  const totalSplit = splits.reduce((sum, split) => sum + Number.parseFloat(split.amount), 0);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Statement Splits</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Total Amount: {formatCurrency(statementData.amount)}
            </p>
            {statementData.accountName !== null && (
              <p className="text-muted-foreground text-sm">
                Paid From: {statementData.accountName}
              </p>
            )}
            {statementData.friendName !== null && (
              <p className="text-muted-foreground text-sm">Paid By: {statementData.friendName}</p>
            )}
            <p className="text-muted-foreground text-sm">
              Split: {formatCurrency(totalSplit)} · Your share:{' '}
              {formatCurrency(Number.parseFloat(statementData.amount) - totalSplit)}
            </p>
          </div>
          {splits.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Existing Splits</h4>
              {splits.map((split) => {
                const friend = friends.find((f) => f.id === split.friendId);
                return (
                  <div key={split.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {friend?.name ?? 'Unknown Friend'}
                      </span>
                      <Button
                        aria-label="Delete split"
                        className="size-6"
                        disabled={deleteSplitMutation.isPending}
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          void handleDeleteSplit(split.id);
                        }}
                      >
                        <Trash className="size-4" />
                      </Button>
                    </div>
                    <DynamicForm
                      className="w-full grid-cols-2 items-end"
                      defaultValues={{
                        amount: split.amount,
                        friendId: split.friendId,
                      }}
                      fields={createAmountSplitFields(friends)}
                      schema={createSplitSchema}
                      showSubmitButton
                      submitButtonDisabled={updateSplitMutation.isPending}
                      submitButtonText="Update"
                      onSubmit={(values) => {
                        void handleUpdateSplit(split.id, values);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Add New Split</h4>
            <DynamicForm
              key={newSplitKey}
              className="w-full grid-cols-2 items-end"
              defaultValues={{
                amount: '0',
                friendId: '',
              }}
              fields={createAmountSplitFields(friends)}
              schema={createSplitSchema}
              showSubmitButton
              submitButtonDisabled={createSplitMutation.isPending}
              submitButtonText="Add Split"
              onSubmit={(values) => {
                void handleAddSplit(values);
              }}
            />
          </div>
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
  const router = useRouter();
  const { data: friends = [] } = api.friends.getFriends.useQuery();
  const bulkSplitConditions = useMemo(():
    { allowed: false } | { allowed: true; maxPercentage: number } => {
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
  const mutation = api.statements.createBulkStatementSplits.useMutation();
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
      refresh={router.refresh}
      schema={bulkSplitSchema}
      successToast={() => 'Bulk splits applied successfully.'}
      titleText="Bulk Statement Splits"
    />
  );
};
