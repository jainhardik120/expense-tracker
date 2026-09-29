'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

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
 * A cell that can be corrected where it sits.
 *
 * Nothing is rendered differently until the list is put into correcting mode,
 * and even then the cell shows its value until it is clicked: a table of fifty
 * rows would otherwise be a hundred and fifty controls, which is slow to draw
 * and hard to read. Clicking one opens the editor for that cell alone, which is
 * how a spreadsheet behaves and what "correct in place" was asking for.
 */
export const EditableCell = ({
  mode,
  display,
  align = 'left',
  children,
}: {
  mode: 'view' | 'edit';
  display: ReactNode;
  align?: 'left' | 'right';
  /** Rendered once the cell is opened; call `stop` to close it again. */
  children: (props: { stop: () => void }) => ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (mode === 'view') {
    return <>{display}</>;
  }
  if (isOpen) {
    return (
      <>
        {children({
          stop: () => {
            setIsOpen(false);
          },
        })}
      </>
    );
  }
  return (
    <button
      className={cn(
        'hover:bg-muted/60 hover:ring-border -mx-1 flex w-[calc(100%+0.5rem)] items-center rounded-sm px-1 text-left hover:ring-1',
        align === 'right' && 'justify-end text-right',
      )}
      type="button"
      onClick={() => {
        setIsOpen(true);
      }}
    >
      {display}
    </button>
  );
};

/** A number, corrected by typing over it. */
export const AmountEditor = ({
  value,
  stop,
  onSave,
}: {
  value: string;
  stop: () => void;
  onSave: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // The cell was clicked to open this, so the caret belongs in it. Selected
  // rather than placed, because correcting an amount usually means replacing it.
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = () => {
    stop();
    // A blank or unparseable box means the correction was abandoned, not that
    // the statement is now worth nothing.
    if (draft !== value && draft.trim() !== '' && !Number.isNaN(Number(draft))) {
      onSave(Number(draft).toFixed(2));
    }
  };

  return (
    <Input
      ref={inputRef}
      className="h-7 px-1 text-right tabular-nums"
      inputMode="decimal"
      step="0.01"
      type="number"
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
      stop();
      if (next !== value) {
        onSave(next);
      }
    }}
  >
    <SelectTrigger className="h-7 w-full px-1" size="sm">
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
        stop();
        if (!isUnchanged) {
          onSave(draft);
        }
      }}
    >
      <PopoverTrigger className="flex w-full flex-wrap gap-1 text-left">
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
                <CommandItem key={option} value={option} onSelect={toggle}>
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
