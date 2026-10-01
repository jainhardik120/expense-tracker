'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Check, GripVertical } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SortableItemHandle } from '@/components/ui/sortable';
import { cn } from '@/lib/utils';

/**
 * The box a spreadsheet draws round the cell you are on.
 *
 * Square, hard against the cell's edges and two pixels thick, because that is
 * what makes a table feel like a grid you are working in rather than a page
 * with a form on it. Drawn inside the cell so it does not push its neighbours
 * apart, and over the padding rather than inside it -- a rounded control
 * floating in the middle of a cell is the thing this replaces.
 */
const CELL_SURFACE = 'absolute inset-0 flex items-center px-2';

/** Where the cursor is, for the arrow keys to move from. */
const CELL_ATTR = 'data-editable-cell';

/**
 * Move to the next cell in a direction, as a spreadsheet does.
 *
 * Found by asking the document rather than by holding a map of the table in
 * state: the cells already say where they are, and every one of them is on the
 * screen -- this is a page of fifty rows, not a virtualised window.
 */
const moveFocus = (from: HTMLElement, rowStep: number, columnStep: number) => {
  const cells = [...document.querySelectorAll<HTMLElement>(`[${CELL_ATTR}]`)];

  // Stepping through the cells that exist rather than to a row number, because
  // not every row has every cell -- a self transfer has no category and no
  // tags -- and aiming at a row that has none of them would strand the cursor.
  // They come out of the document in reading order, so filtering by column
  // leaves them in row order.
  const line =
    rowStep === 0
      ? cells.filter((cell) => cell.dataset['row'] === from.dataset['row'])
      : cells.filter((cell) => cell.dataset['col'] === from.dataset['col']);
  line[line.indexOf(from) + (rowStep === 0 ? columnStep : rowStep)]?.focus();
};

/**
 * A cell that can be corrected where it sits.
 *
 * Nothing changes until the list is put into correcting mode. After that the
 * cell behaves the way a spreadsheet's does: clicking picks it out, typing or
 * Enter opens it, Escape abandons whatever was typed, and the arrow keys walk
 * between cells without touching the mouse. It shows its value until opened,
 * so a page stays fifty rows rather than becoming a hundred and fifty
 * controls.
 */
export const EditableCell = ({
  mode,
  display,
  rowIndex,
  columnId,
  children,
}: {
  mode: 'view' | 'edit';
  display: ReactNode;
  rowIndex: number;
  columnId: string;
  /**
   * Rendered once the cell is opened; call `stop` to close it again. `seed` is
   * the character that opened it, when it was opened by typing rather than by
   * Enter -- a spreadsheet starts the correction with it rather than dropping
   * it on the floor.
   */
  children: (props: { stop: () => void; seed: string | null }) => ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);

  const wasOpen = useRef(false);

  const stop = useCallback(() => {
    setIsOpen(false);
    setSeed(null);
  }, []);

  // Closing a cell puts the cursor back on it, so the next arrow key carries on
  // from where the correction was made rather than from the top of the page.
  // After the render that puts the cell back, not in `stop` itself: the thing
  // to focus does not exist at the moment the editor asks to be closed. Found
  // by its address rather than held as a ref, which is already how the arrow
  // keys find their way about.
  useEffect(() => {
    if (!isOpen && wasOpen.current) {
      document
        .querySelector<HTMLElement>(
          `[${CELL_ATTR}][data-row="${rowIndex}"][data-col="${columnId}"]`,
        )
        ?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen, rowIndex, columnId]);

  if (mode === 'view') {
    return <>{display}</>;
  }

  return (
    <>
      {/* Stays in flow even while being corrected, so opening a cell cannot
          change the height of a row -- but hidden, because an input is only
          part-opaque in the dark theme and the old value showed through the
          new one. */}
      <span className={isOpen ? 'invisible' : undefined}>{display}</span>
      {isOpen ? (
        children({ stop, seed })
      ) : (
        <button
          className={cn(
            CELL_SURFACE,
            // Invisible until wanted: the value is already drawn underneath, so
            // all this contributes is the box. An outline rather than a ring --
            // it is pulled inside the cell by its own offset, so the box sits
            // on the cell's edges instead of straddling its neighbours.
            'rounded-none opacity-0 transition-none',
            'hover:outline-border hover:opacity-100 hover:-outline-offset-1 hover:outline-1',
            'focus:outline-primary focus:opacity-100 focus:-outline-offset-2 focus:outline-2',
          )}
          data-col={columnId}
          data-editable-cell=""
          data-row={rowIndex}
          type="button"
          onDoubleClick={() => {
            setSeed(null);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            const STEPS: Partial<Record<string, [number, number]>> = {
              ArrowDown: [1, 0],
              ArrowUp: [-1, 0],
              ArrowRight: [0, 1],
              ArrowLeft: [0, -1],
            };
            const step = STEPS[event.key];
            if (step) {
              event.preventDefault();
              moveFocus(event.currentTarget, step[0], step[1]);
              return;
            }
            // Enter opens it; so does simply starting to type, which is how a
            // spreadsheet lets you correct a cell without reaching for F2.
            if (event.key === 'Enter' || (event.key.length === 1 && !event.metaKey && !event.ctrlKey)) {
              event.preventDefault();
              setSeed(event.key === 'Enter' ? null : event.key);
              setIsOpen(true);
            }
          }}
        >
          {/* The value is already behind this, so the box is all that is drawn. */}
          <span className="sr-only">Edit {columnId}</span>
        </button>
      )}
    </>
  );
};

/** A number, corrected by typing over it. */
export const AmountEditor = ({
  value,
  seed,
  stop,
  onSave,
}: {
  value: string;
  seed: string | null;
  stop: () => void;
  onSave: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(seed ?? value);
  const inputRef = useRef<HTMLInputElement>(null);

  // The cell was opened to type in, so the caret belongs here, and the whole
  // value is selected because correcting an amount usually means replacing it.
  // Unless a character opened the cell, in which case it has already replaced
  // it and the caret belongs after it.
  useEffect(() => {
    if (seed === null) {
      inputRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    // A blank or unparseable box means the correction was abandoned, not that
    // the statement is now worth nothing.
    if (draft !== value && draft.trim() !== '' && !Number.isNaN(Number(draft))) {
      onSave(Number(draft).toFixed(2));
    }
    stop();
  };

  return (
    <Input
      ref={inputRef}
      className={cn(
        CELL_SURFACE,
        'border-primary bg-background size-full rounded-none border-2 text-right tabular-nums shadow-none',
        // The same box as the selected cell it replaces. Left alone the input
        // takes the focus ring's colour instead, so a cell changed colour at
        // the moment it opened.
        'focus-visible:border-primary focus-visible:ring-0',
      )}
      // Deliberately text rather than number: a number input refuses to have
      // its contents selected, so typing over a cell could not replace what was
      // there, and it carries spinner arrows that a spreadsheet cell does not.
      inputMode="decimal"
      type="text"
      value={draft}
      onBlur={commit}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
        } else if (event.key === 'Escape') {
          stop();
        }
      }}
    />
  );
};

/** One of a known set, so it is picked rather than typed. */
export const SelectEditor = ({
  value,
  options,
  stop,
  onSave,
}: {
  value: string;
  options: string[];
  stop: () => void;
  onSave: (next: string) => void;
}) => (
  <Select
    defaultOpen
    value={value}
    onOpenChange={(open) => {
      if (!open) {
        stop();
      }
    }}
    onValueChange={(next) => {
      if (next !== value) {
        onSave(next);
      }
      stop();
    }}
  >
    <SelectTrigger
      className={cn(
        CELL_SURFACE,
        'border-primary bg-background rounded-none border-2 shadow-none',
        'focus-visible:border-primary focus-visible:ring-0',
        // A select trigger is built to be as wide as its value and as tall as
        // a form control, which is not what a cell is. Both have to be undone
        // for the box to reach the cell's edges: the width merges away, but
        // the height is set behind an attribute selector that outranks a plain
        // class, so it takes the important modifier to beat it.
        'h-auto! w-auto',
      )}
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option} value={option}>
          {option}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/**
 * Any number of tags, including ones that do not exist yet.
 *
 * Saved when the list is closed rather than on every tick, so adding three tags
 * is one write instead of three.
 */
export const TagsEditor = ({
  value,
  options,
  stop,
  onSave,
}: {
  value: string[];
  options: string[];
  stop: () => void;
  onSave: (next: string[]) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const [search, setSearch] = useState('');

  const toggle = (tag: string) => {
    setDraft((current) =>
      current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag],
    );
    setSearch('');
  };

  const isUnchanged =
    draft.length === value.length && draft.every((tag, index) => tag === value[index]);

  return (
    <Popover
      defaultOpen
      onOpenChange={(open) => {
        if (open) {
          return;
        }
        if (!isUnchanged) {
          onSave(draft);
        }
        stop();
      }}
    >
      <PopoverTrigger
        className={cn(
          CELL_SURFACE,
          'border-primary bg-background gap-1 overflow-hidden rounded-none border-2',
        )}
      >
        {draft.length === 0 ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          draft.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Find or add a tag" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No tag by that name.</CommandEmpty>
            {/* A tag that does not exist yet is offered as itself, so a new one
                is made by typing it and pressing enter. */}
            {search.trim() !== '' && !options.includes(search.trim()) ? (
              <CommandGroup>
                <CommandItem
                  value={search.trim()}
                  onSelect={() => {
                    toggle(search.trim());
                  }}
                >
                  Add &ldquo;{search.trim()}&rdquo;
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  // Not `onSelect={toggle}`: cmdk hands the handler its own
                  // normalised copy of the value, which is lower-cased. A tag
                  // that is already on the statement never matched the list, so
                  // ticking it off added a second, lower-case one instead of
                  // taking it away. The option itself is what was meant.
                  onSelect={() => {
                    toggle(option);
                  }}
                >
                  <Check
                    className={cn('size-4', draft.includes(option) ? 'opacity-100' : 'opacity-0')}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

/** The grip a row is dragged by, to put it somewhere else in the order. */
export const ReorderHandle = () => (
  <SortableItemHandle asChild>
    <Button className="size-8" size="icon" variant="ghost">
      <GripVertical className="size-4" />
    </Button>
  </SortableItemHandle>
);
