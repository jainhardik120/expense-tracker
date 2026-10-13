'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatCurrency } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';

const STEP = 1000;
const SAVE_DELAY_MS = 700;

type SaveState = 'idle' | 'waiting' | 'saving' | 'saved' | { error: string };

const roundUp = (value: number) => Math.ceil(value / STEP) * STEP;

const statusText = (state: SaveState): string => {
  if (typeof state === 'object') {
    return `Not saved: ${state.error}`;
  }
  switch (state) {
    case 'waiting':
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'idle':
    default:
      return 'Changes save as you drag';
  }
};

export const GoalEditor = ({
  budgetYearId,
  goal,
  draft,
  noLivingAbove,
  investedSoFar,
  onDraftChange,
  onDone,
}: {
  budgetYearId: string;
  goal: number;
  draft: number;
  noLivingAbove: number;
  investedSoFar: number;
  onDraftChange: (value: number) => void;
  onDone: (saved: boolean) => void;
}) => {
  const router = useRouter();
  const setGoal = api.budget.setGoal.useMutation();
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | null>(null);
  const pending = useRef<number | null>(null);
  const max = roundUp(Math.max(goal, draft, noLivingAbove, STEP));

  const save = async (amount: number): Promise<boolean> => {
    pending.current = null;
    setState('saving');
    try {
      await setGoal.mutateAsync({ budgetYearId, amount });
      setState('saved');
      router.refresh();
      return true;
    } catch (error) {
      setState({ error: errorMessage(error) });
      return false;
    }
  };

  const flush = async (): Promise<boolean> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) {
      return save(pending.current);
    }
    return typeof state !== 'object';
  };

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-xs">Investment goal for the year</p>
        <p className="text-xl font-semibold tabular-nums">{formatCurrency(draft)}</p>
      </div>
      <Slider
        aria-label="Investment goal"
        max={max}
        min={STEP}
        step={STEP}
        value={[draft]}
        onValueChange={([value]) => {
          onDraftChange(value);
          pending.current = value;
          setState('waiting');
          if (timer.current !== null) {
            window.clearTimeout(timer.current);
          }
          timer.current = window.setTimeout(() => {
            timer.current = null;
            void save(value);
          }, SAVE_DELAY_MS);
        }}
      />
      <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>{formatCurrency(STEP)}</span>
        <span>{formatCurrency(max)}</span>
      </div>
      <p className="text-muted-foreground text-xs">
        Already invested {formatCurrency(investedSoFar)}.{' '}
        {noLivingAbove > STEP
          ? `Above ${formatCurrency(noLivingAbove)} nothing is left for living this year.`
          : 'Even the lowest goal leaves nothing for living this year.'}
      </p>
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-xs ${typeof state === 'object' ? 'text-red-600' : 'text-muted-foreground'}`}
        >
          {statusText(state)}
        </p>
        <Button
          disabled={state === 'saving'}
          size="sm"
          variant="outline"
          onClick={async () => {
            onDone(await flush());
          }}
        >
          Done
        </Button>
      </div>
    </div>
  );
};
