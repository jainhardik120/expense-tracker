'use client';

import { Children, useId, useState } from 'react';

import { ChevronLeft, ChevronRight, CircleQuestionMark } from 'lucide-react';

import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const HelpTopic = ({
  title,
  label,
  children,
}: {
  title: string;
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

          <div
            aria-label={`${title} steps`}
            className="flex items-center gap-1.5"
            role="tablist"
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
