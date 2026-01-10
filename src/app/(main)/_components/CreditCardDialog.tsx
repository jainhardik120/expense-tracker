'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { CreditCard, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/server/react';
import { createCreditCardAccountSchema } from '@/types';

type CreditCardDialogProps = Readonly<{
  accountId: string;
  accountName: string;
  existingCreditCard?: {
    id: string;
    cardLimit: string;
  } | null;
}>;

export const CreditCardDialog = ({
  accountId,
  accountName,
  existingCreditCard,
}: CreditCardDialogProps) => {
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(existingCreditCard !== null);
  const router = useRouter();

  const createMutation = api.accounts.createCreditCard.useMutation();
  const updateMutation = api.accounts.updateCreditCard.useMutation();
  const deleteMutation = api.accounts.deleteCreditCard.useMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<z.infer<typeof createCreditCardAccountSchema>>({
    resolver: zodResolver(createCreditCardAccountSchema),
    defaultValues: {
      accountId,
      cardLimit: existingCreditCard?.cardLimit ?? '',
    },
  });

  const onSubmit = async (data: z.infer<typeof createCreditCardAccountSchema>) => {
    try {
      if (existingCreditCard !== null && existingCreditCard !== undefined) {
        await updateMutation.mutateAsync({
          id: existingCreditCard.id,
          accountId: data.accountId,
          cardLimit: data.cardLimit,
        });
        toast.success('Credit card limit updated successfully');
      } else {
        await createMutation.mutateAsync(data);
        toast.success('Account converted to credit card successfully');
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleDelete = async () => {
    if (existingCreditCard === null || existingCreditCard === undefined) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id: existingCreditCard.id });
      toast.success('Credit card removed successfully');
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleConvertClick = () => {
    setShowForm(true);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen && (existingCreditCard === null || existingCreditCard === undefined)) {
      // Reset to initial state when closing if not an existing credit card
      setShowForm(false);
      reset({ accountId, cardLimit: '' });
    }
  };

  const isExistingCreditCard = existingCreditCard !== null && existingCreditCard !== undefined;

  const getButtonText = () => {
    if (isSubmitting) {
      return 'Saving...';
    }
    if (isExistingCreditCard) {
      return 'Update Limit';
    }
    return 'Create Credit Card';
  };

  return (
    <Modal
      className="sm:max-w-fit sm:min-w-106.25"
      description={
        isExistingCreditCard
          ? `Manage credit card settings for ${accountName}`
          : `Convert ${accountName} to a credit card account`
      }
      open={open}
      setOpen={handleOpenChange}
      title={isExistingCreditCard ? 'Manage Credit Card' : 'Convert to Credit Card'}
      trigger={
        <Button
          className="size-8"
          size="icon"
          variant={isExistingCreditCard ? 'default' : 'outline'}
        >
          <CreditCard className="size-4" />
        </Button>
      }
    >
      {!showForm && !isExistingCreditCard ? (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            This will convert the account into a credit card account with a credit limit.
          </p>
          <Button onClick={handleConvertClick}>Convert to Credit Card</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cardLimit">Credit Limit</Label>
              <Input
                id="cardLimit"
                placeholder="Enter credit limit"
                type="text"
                {...register('cardLimit')}
              />
              {errors.cardLimit === undefined ? null : (
                <p className="text-destructive text-sm">{errors.cardLimit.message}</p>
              )}
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <div>
              {isExistingCreditCard ? (
                <Button
                  disabled={deleteMutation.isPending}
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 size-4" />
                  Remove Credit Card
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                disabled={isSubmitting}
                type="button"
                variant="outline"
                onClick={() => {
                  handleOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {getButtonText()}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
};
