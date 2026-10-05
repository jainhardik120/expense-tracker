'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

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
import { api } from '@/server/react';

import { type InboxEntry } from './inbox-columns';

export const MergeMatchesDialog = ({
  entries,
  trigger,
}: {
  entries: InboxEntry[];
  trigger: React.ReactNode;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mutation = api.friends.mergeMatches.useMutation();
  const pairs = entries.flatMap((entry) =>
    entry.status === 'pending' && entry.match !== null
      ? [{ mine: entry.match.id, theirs: entry.id }]
      : [],
  );
  const friendNames = [...new Set(entries.map((entry) => entry.friendName))].join(', ');
  const count = pairs.length;
  const statementsWord = count === 1 ? 'statement' : 'statements';

  const onMerge = () => {
    mutation
      .mutateAsync({ pairs })
      .then((result) => {
        toast.success(`${result.merged} ${result.merged === 1 ? 'match' : 'matches'} merged`);
        setOpen(false);
        router.refresh();
        return undefined;
      })
      .catch((error: unknown) => {
        setOpen(false);
        toast.error(errorMessage(error));
      });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Merge {count} {statementsWord} into yours
          </AlertDialogTitle>
          <AlertDialogDescription>
            Your {statementsWord} stay exactly as they are and become the only version.{' '}
            {friendNames}&apos;s matching {statementsWord} will be removed, and they will see yours
            instead, keeping their own category, tags and account. Their totals will use your amount
            and date.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={mutation.isPending || count === 0} onClick={onMerge}>
            {mutation.isPending ? 'Merging...' : 'Merge'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
