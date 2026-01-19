'use client';

import { useState } from 'react';

import { SquareSlash, Trash } from 'lucide-react';
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
import { createEmiSplitSchema, type Emi } from '@/types';

const createEmiSplitFields = (friends: Array<{ id: string; name: string }>) =>
  [
    {
      name: 'percentage',
      label: 'Percentage',
      type: 'number',
      placeholder: '0',
    },
    {
      name: 'friendId',
      label: 'Friend',
      type: 'select',
      placeholder: 'Select Friend',
      options: friends.map((friend) => ({
        label: friend.name,
        value: friend.id,
      })),
    },
  ] as const;

export const EmiSplitsDialog = ({ emiId, emiData }: { emiId: string; emiData: Emi }) => {
  const [open, setOpen] = useState(false);
  const { data: friends = [] } = api.friends.getFriends.useQuery(undefined, { enabled: open });
  const { data: splits = [], refetch } = api.emis.getEmiSplits.useQuery(
    {
      emiId: emiId,
    },
    {
      enabled: open,
    },
  );

  const addSplitMutation = api.emis.addEmiSplit.useMutation();
  const updateSplitMutation = api.emis.updateEmiSplit.useMutation();
  const deleteSplitMutation = api.emis.deleteEmiSplit.useMutation();

  const handleAddSplit = async (values: z.infer<typeof createEmiSplitSchema>) => {
    try {
      await addSplitMutation.mutateAsync({
        emiId: emiId,
        friendId: values.friendId,
        percentage: values.percentage,
      });
      await refetch();
      toast.success('Split added successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleUpdateSplit = async (
    splitIndex: number,
    values: z.infer<typeof createEmiSplitSchema>,
  ) => {
    try {
      await updateSplitMutation.mutateAsync({
        emiId: emiId,
        splitIndex: splitIndex,
        friendId: values.friendId,
        percentage: values.percentage,
      });
      await refetch();
      toast.success('Split updated successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDeleteSplit = async (splitIndex: number) => {
    try {
      await deleteSplitMutation.mutateAsync({
        emiId: emiId,
        splitIndex: splitIndex,
      });
      await refetch();
      toast.success('Split deleted successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const totalPercentage = splits.reduce((sum, split) => {
    return sum + parseFloat(split.percentage);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="size-8" size="icon" variant="ghost">
          <SquareSlash />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>EMI Splits</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">EMI Name: {emiData.name}</p>
            <p className="text-muted-foreground text-sm">
              Total Allocated: {totalPercentage.toFixed(2)}%
            </p>
            <p className="text-muted-foreground text-sm">
              Remaining: {(100 - totalPercentage).toFixed(2)}%
            </p>
          </div>

          {splits.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Existing Splits</h4>
              {splits.map((split, index) => {
                const friend = friends.find((f) => f.id === split.friendId);
                const splitKey = `split-${split.friendId}-${split.percentage}-${String(index)}`;
                return (
                  <div key={splitKey} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {friend?.name ?? 'Unknown Friend'}
                      </span>
                      <Button
                        className="size-6"
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          void handleDeleteSplit(index);
                        }}
                      >
                        <Trash className="size-4" />
                      </Button>
                    </div>
                    <DynamicForm
                      className="grid-cols-2 items-end"
                      defaultValues={{
                        percentage: split.percentage,
                        friendId: split.friendId,
                      }}
                      fields={createEmiSplitFields(friends)}
                      schema={createEmiSplitSchema}
                      showSubmitButton
                      submitButtonDisabled={updateSplitMutation.isPending}
                      submitButtonText="Update"
                      onSubmit={(values) => {
                        void handleUpdateSplit(index, values);
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
              className="grid-cols-2 items-end"
              defaultValues={{
                percentage: '0',
                friendId: friends[0]?.id ?? '',
              }}
              fields={createEmiSplitFields(friends)}
              schema={createEmiSplitSchema}
              showSubmitButton
              submitButtonDisabled={addSplitMutation.isPending || friends.length === 0}
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
