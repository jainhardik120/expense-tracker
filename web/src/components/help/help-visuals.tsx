'use client';

import { Check, X } from 'lucide-react';

import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One step of a topic: a heading, an optional line of prose, then the visual. */
export const HelpCard = ({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {lede === undefined ? null : <p className="text-muted-foreground text-xs">{lede}</p>}
    </div>
    {children}
  </div>
);

/** A line of prose under a visual. Deliberately the only prose on a card. */
export const HelpNote = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground text-xs">{children}</p>
);

type Tone = 'spent' | 'committed' | 'free' | 'over';

const FILL: Record<Tone, string> = {
  spent: 'bg-help-spent',
  committed: 'bg-help-committed',
  free: 'bg-muted',
  over: 'bg-destructive',
};

export type Segment = { label: string; value: number; tone: Tone };

/**
 * A budget as a bar, broken into what it went on.
 *
 * Segments are separated by a gap in the surface colour rather than a border,
 * and every one of them is named and valued in the rows underneath, so the
 * colours never have to be matched from memory and the figures are readable
 * with the bar ignored entirely.
 */
export const HelpBar = ({ segments }: { segments: Segment[] }) => {
  const total = segments.reduce((sum, segment) => sum + Math.abs(segment.value), 0);
  // A zero segment has no width to draw but is still worth naming: half of
  // what these bars show is that a line got nothing.
  const drawn = segments.filter((segment) => segment.value !== 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-md">
        {drawn.map((segment) => (
          <div
            key={segment.label}
            className={cn(FILL[segment.tone], 'first:rounded-l-md last:rounded-r-md')}
            style={{ width: `${String((Math.abs(segment.value) / total) * 100)}%` }}
          />
        ))}
      </div>
      <dl className="flex flex-col gap-1">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2 text-xs">
            <span className={cn(FILL[segment.tone], 'size-2 shrink-0 rounded-full')} />
            <dt className="text-muted-foreground">{segment.label}</dt>
            <dd className="ml-auto font-medium tabular-nums">{formatCurrency(segment.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

/** A string value is printed as given: not every row of a sum is money. */
export type CalcRow = { label: string; value: number | string; note?: string };

const formatValue = (value: number | string): string => {
  if (typeof value === 'string') {
    return value;
  }
  const sign = value < 0 ? '\u2212' : '';
  return `${sign}${formatCurrency(Math.abs(value))}`;
};

/**
 * The sum itself, written out.
 *
 * Every figure the app shows is arithmetic on figures it also shows, and the
 * quickest way to make one believable is to do it in front of the reader.
 */
export const HelpCalc = ({
  rows,
  result,
  tone = 'neutral',
}: {
  rows: CalcRow[];
  result: CalcRow;
  tone?: 'neutral' | 'bad';
}) => (
  <div className="bg-muted/40 flex flex-col gap-1 rounded-md p-3 text-xs">
    {rows.map((row) => (
      <div key={row.label} className="flex items-baseline gap-2">
        <span className="text-muted-foreground">{row.label}</span>
        {row.note === undefined ? null : (
          <span className="text-muted-foreground/70">{row.note}</span>
        )}
        <span className="ml-auto tabular-nums">{formatValue(row.value)}</span>
      </div>
    ))}
    <div className="border-border mt-1 flex items-baseline gap-2 border-t pt-2">
      <span className="font-medium">{result.label}</span>
      {result.note === undefined ? null : (
        <span className="text-muted-foreground/70">{result.note}</span>
      )}
      <span
        className={cn(
          'ml-auto font-semibold tabular-nums',
          // Only the overspend gets a colour, and it is the one the app already
          // uses for it. Underspending is called out by the word beside it
          // instead: the chart hues are for marks, and unreadable as text.
          tone === 'bad' && 'text-destructive',
        )}
      >
        {formatValue(result.value)}
      </span>
    </div>
  </div>
);

/**
 * Rules tried in order until one matches.
 *
 * The single hardest thing to see in the budget is that a statement stops at
 * the first line that wants it, so the lines it would also have matched are
 * drawn, struck through, rather than left out.
 */
export const HelpMatchList = ({
  subject,
  rows,
}: {
  subject: string;
  rows: { label: string; matches: boolean }[];
}) => {
  const winner = rows.findIndex((row) => row.matches);
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted text-muted-foreground w-fit rounded-md px-2 py-1 text-xs">
        {subject}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row, index) => {
          const claimed = index === winner;
          const skipped = row.matches && index > winner;
          return (
            <div
              key={row.label}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs',
                claimed ? 'border-help-spent bg-help-spent/10' : 'border-transparent',
              )}
            >
              <span className="text-muted-foreground w-4 tabular-nums">{index + 1}</span>
              <span className={cn(skipped && 'text-muted-foreground line-through')}>
                {row.label}
              </span>
              {claimed ? (
                <span className="ml-auto flex items-center gap-1 font-medium">
                  <Check className="size-3" />
                  claims it
                </span>
              ) : null}
              {skipped ? (
                <span className="text-muted-foreground ml-auto flex items-center gap-1">
                  <X className="size-3" />
                  already taken
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Two outcomes of the same setup, side by side. */
export const HelpCompare = ({
  items,
}: {
  items: { title: string; children: React.ReactNode }[];
}) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {items.map((item) => (
      <div key={item.title} className="flex flex-col gap-2">
        <div className="text-muted-foreground text-xs font-medium">{item.title}</div>
        {item.children}
      </div>
    ))}
  </div>
);

/** A single figure with its name, for the one number a card is actually about. */
export const HelpFigure = ({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'bad';
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span
      className={cn(
        'text-lg font-semibold tabular-nums',
        tone === 'bad' && 'text-destructive',
      )}
    >
      {value}
    </span>
  </div>
);
