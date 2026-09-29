'use client';

import { Children, useId, useState } from 'react';

import { ChevronLeft, ChevronRight, CircleQuestionMark } from 'lucide-react';

import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A `?` beside a section, opening an explanation of it.
 *
 * One card at a time rather than a page to scroll: the thing being explained is
 * usually a sequence -- what it is, then each option, then what the numbers do
 * -- and a reader who has to scroll past four options to reach the one they
 * came for has been handed a manual again.
 *
 * Children are the cards, in order. Anything renders; HelpCard is the usual
 * one.
 */
export const HelpTopic = ({
  title,
  label,
  children,
}: {
  title: string;
  /** What the button opens, for screen readers. */
  label: string;
  children: React.ReactNode;
}) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const cards = Children.toArray(children);
  const last = cards.length - 1;
  const at = Math.min(step, last);

  const go = (next: number) => {
    setStep(Math.max(0, Math.min(last, next)));
  };

  return (
    <Modal
      className="sm:max-w-140"
      open={open}
      setOpen={(next) => {
        setOpen(next);
        // Reopening starts at the beginning rather than wherever it was shut.
        if (!next) {
          setStep(0);
        }
      }}
      title={title}
      trigger={
        <Button
          aria-label={label}
          className="text-muted-foreground hover:text-foreground size-6 rounded-full"
          size="icon"
          type="button"
          variant="ghost"
        >
          <CircleQuestionMark className="size-4" />
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Sized so the shorter cards do not make the dialog jump as it is
            paged through. */}
        <div className="min-h-75" id={`${id}-panel`} role="tabpanel">
          {cards[at]}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            aria-label="Previous"
            disabled={at === 0}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => {
              go(at - 1);
            }}
          >
            <ChevronLeft />
          </Button>

          {/* A tablist rather than a row of dots: the arrow keys that move
              between steps are the pattern's own, and a reader on a screen
              reader is told which step this is and how many there are. */}
          <div
            aria-label={`${title} steps`}
            className="flex items-center gap-1.5"
            role="tablist"
            // The tabs carry the focus, one at a time; the list itself is only
            // focusable so that it is never skipped over entirely.
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                go(at + 1);
              }
              if (event.key === 'ArrowLeft') {
                go(at - 1);
              }
            }}
          >
            {cards.map((card, index) => (
              <button
                key={`step-${String(index)}`}
                aria-controls={`${id}-panel`}
                aria-label={`Step ${index + 1} of ${cards.length}`}
                aria-selected={index === at}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  index === at ? 'bg-foreground w-4' : 'bg-muted-foreground/30 w-1.5',
                )}
                role="tab"
                tabIndex={index === at ? 0 : -1}
                type="button"
                onClick={() => {
                  go(index);
                }}
              />
            ))}
          </div>

          <Button
            aria-label="Next"
            disabled={at === last}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => {
              go(at + 1);
            }}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </Modal>
  );
};
