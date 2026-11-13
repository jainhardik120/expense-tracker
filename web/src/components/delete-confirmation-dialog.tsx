'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/utils';

import { type DialogControl } from './modal';

type DeleteConfirmationDialogProps<T, MutationResult> = {
  mutationInput: T;
  children?: React.ReactNode;
  dialog?: DialogControl;
  title?: string;
  description?: string;
  actionLabel?: string;
  pendingLabel?: string;
  onCancel?: () => void;
  refresh?: () => void;
  mutation: { mutateAsync: (values: T) => Promise<MutationResult>; isPending: boolean };
  successToast?: (mutationResult: MutationResult) => string;
};

const DeleteConfirmationDialog = <T, MutationResult>({
  mutationInput,
  children,
  dialog,
  title = 'Are you absolutely sure?',
  description = 'This action cannot be undone. This will permanently delete the selected item.',
  actionLabel = 'Delete',
  pendingLabel = 'Deleting...',
  onCancel,
  mutation,
  refresh,
  successToast = () => 'Deleted successfully',
}: DeleteConfirmationDialogProps<T, MutationResult>) => {
  const [localOpen, setLocalOpen] = useState(false);
  const open = dialog?.open ?? localOpen;
  const setOpen = dialog?.onOpenChange ?? setLocalOpen;

  const handleCancel = () => {
    onCancel?.();
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {children === undefined ? null : <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending} onClick={handleCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={() => {
              mutation
                .mutateAsync(mutationInput)
                .then((result) => {
                  toast(successToast(result));
                  setOpen(false);
                  return refresh?.();
                })
                .catch((err) => {
                  setOpen(false);
                  toast.error(errorMessage(err));
                });
            }}
          >
            {mutation.isPending ? pendingLabel : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteConfirmationDialog;
