'use client';

import { useRef, useState } from 'react';

import { toast } from 'sonner';

import { Textarea } from '@/components/ui/textarea';
import { api } from '@/server/react';

export const ReportNoteCell = ({
  boundaryId,
  initialNote,
  refresh,
}: {
  boundaryId: string | undefined;
  initialNote: string;
  refresh?: () => void;
}) => {
  const [note, setNote] = useState(initialNote);
  // Tracks what the server currently holds so blur only writes on a real change.
  const savedNote = useRef(initialNote);
  const mutation = api.reports.updateBoundaryNote.useMutation();

  if (boundaryId === undefined) {
    return (
      <p className="text-muted-foreground/60 py-2 text-sm italic">
        No boundary owns this period yet
      </p>
    );
  }

  const save = async () => {
    if (note === savedNote.current) {
      return;
    }
    try {
      await mutation.mutateAsync({ id: boundaryId, note });
      savedNote.current = note;
      toast('Note saved');
      refresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setNote(savedNote.current);
    }
  };

  return (
    <Textarea
      className="hover:border-input focus-visible:border-ring min-h-16 w-full resize-none border-transparent bg-transparent whitespace-pre-wrap shadow-none"
      disabled={mutation.isPending}
      placeholder="Add a note for this period…"
      value={note}
      onBlur={save}
      onChange={(event) => {
        setNote(event.target.value);
      }}
    />
  );
};
