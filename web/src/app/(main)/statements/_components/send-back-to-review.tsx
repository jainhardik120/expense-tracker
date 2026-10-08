'use client';

import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { RowActionTrigger } from '@/components/data-table/row-actions';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';

export const SendBackToReview = ({ id, onRefresh }: { id: string; onRefresh: () => void }) => {
  const reopen = api.friends.reopenInboxEntries.useMutation();
  return (
    <RowActionTrigger
      disabled={reopen.isPending}
      icon={RotateCcw}
      label="Send back to review"
      onClick={() => {
        reopen
          .mutateAsync({ ids: [id] })
          .then(() => {
            onRefresh();
            return undefined;
          })
          .catch((error: unknown) => toast.error(errorMessage(error)));
      }}
    />
  );
};
