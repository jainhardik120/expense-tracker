import { useState } from 'react';

import { toast } from 'sonner';
import { type z } from 'zod';

import DynamicForm from '@/components/dynamic-form/dynamic-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { api } from '@/server/react';
import { createSplitSchema, type Statement } from '@/types';

const StatementSplits = ({
  statementId,
  statementData,
}: {
  statementId: string;
  statementData: Statement;
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
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-8" variant="outline">
          View Splits
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Statement Splits</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p>Total Amount: {statementData.amount}</p>
          {statementData.accountName !== null && <p>Paid From: {statementData.accountName}</p>}
          {statementData.friendName !== null && <p>Paid By: {statementData.accountName}</p>}
          {[...splits, { id: 'new-split', amount: '0', friendId: '' }].map((split) => {
            return (
              <DynamicForm
                key={split.id}
                className="grid-cols-3 items-end"
                defaultValues={{
                  amount: split.amount,
                  friendId: split.friendId,
                }}
                fields={[
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
                ]}
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

export default StatementSplits;
