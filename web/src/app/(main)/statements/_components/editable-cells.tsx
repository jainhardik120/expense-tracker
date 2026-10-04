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

const CELL_SURFACE = 'absolute inset-0 flex items-center px-2';

const CELL_ATTR = 'data-editable-cell';

const moveFocus = (from: HTMLElement, rowStep: number, columnStep: number) => {
  const cells = [...document.querySelectorAll<HTMLElement>(`[${CELL_ATTR}]`)];

  const line =
    rowStep === 0
      ? cells.filter((cell) => cell.dataset['row'] === from.dataset['row'])
      : cells.filter((cell) => cell.dataset['col'] === from.dataset['col']);
  line[line.indexOf(from) + (rowStep === 0 ? columnStep : rowStep)]?.focus();
};

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
  children: (props: { stop: () => void; seed: string | null }) => ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);

  const wasOpen = useRef(false);

  const stop = useCallback(() => {
    setIsOpen(false);
    setSeed(null);
  }, []);

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
      <span className={isOpen ? 'invisible' : undefined}>{display}</span>
      {isOpen ? (
        children({ stop, seed })
      ) : (
        <button
          className={cn(
            CELL_SURFACE,
            'rounded-none opacity-0 transition-none',
            'hover:outline-border hover:opacity-100 hover:outline-1 hover:-outline-offset-1',
            'focus:outline-primary focus:opacity-100 focus:outline-2 focus:-outline-offset-2',
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
            if (step !== undefined) {
              event.preventDefault();
              moveFocus(event.currentTarget, step[0], step[1]);
              return;
            }
            if (
              event.key === 'Enter' ||
              (event.key.length === 1 && !event.metaKey && !event.ctrlKey)
            ) {
              event.preventDefault();
              setSeed(event.key === 'Enter' ? null : event.key);
              setIsOpen(true);
            }
          }}
        >
          <span className="sr-only">Edit {columnId}</span>
        </button>
      )}
    </>
  );
};

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

  useEffect(() => {
    if (seed === null) {
      inputRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
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
        'focus-visible:border-primary focus-visible:ring-0',
      )}
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

export const ReorderHandle = () => (
  <SortableItemHandle asChild>
    <Button className="size-8" size="icon" variant="ghost">
      <GripVertical className="size-4" />
    </Button>
  </SortableItemHandle>
);
