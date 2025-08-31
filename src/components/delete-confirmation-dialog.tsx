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

type DeleteConfirmationDialogProps<T, MutationResult> = {
  mutationInput: T;
  children?: React.ReactNode;
  title?: string;
  description?: string;
  onCancel?: () => void;
  refresh?: () => void;
  mutation: { mutateAsync: (values: T) => Promise<MutationResult>; isPending: boolean };
  successToast?: (mutationResult: MutationResult) => string;
};

const DeleteConfirmationDialog = <T, MutationResult>({
  mutationInput,
  children,
  title = 'Are you absolutely sure?',
  description = 'This action cannot be undone. This will permanently delete the selected item.',
  onCancel,
  mutation,
  refresh,
  successToast = () => 'Deleted successfully',
}: DeleteConfirmationDialogProps<T, MutationResult>) => {
  const [open, setOpen] = useState(false);

  const handleCancel = () => {
    onCancel?.();
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {children === undefined ? null : <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent className="bg-black">
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
                  toast.error(err instanceof Error ? err.message : String(err));
                });
            }}
          >
            {mutation.isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteConfirmationDialog;
