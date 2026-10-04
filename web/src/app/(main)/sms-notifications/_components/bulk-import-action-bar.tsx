'use client';

import { useMemo, useState } from 'react';

import { type RowData } from '@tanstack/react-table';
import { EyeOff, RotateCcw, X } from 'lucide-react';

import {
  DataTableActionBar,
  DataTableActionBarAction,
} from '@/components/data-table/data-table-action-bar';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Table } from '@/lib/table';

type Option = { label: string; value: string };

const BulkValuePicker = ({
  label,
  options,
  creatable = false,
  onPick,
}: {
  label: string;
  options: Option[];
  creatable?: boolean;
  onPick: (value: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const typed = query.trim();
  const canCreate =
    creatable &&
    typed !== '' &&
    !options.some((option) => option.label.toLowerCase() === typed.toLowerCase());

  const pick = (value: string) => {
    onPick(value);
    setQuery('');
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <DataTableActionBarAction>{label}</DataTableActionBarAction>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-0" data-grid-popover="" side="top">
        <Command>
          <CommandInput placeholder={`${label}...`} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            {canCreate ? (
              <CommandGroup>
                <CommandItem
                  value={typed}
                  onSelect={() => {
                    pick(typed);
                  }}
                >
                  Create “{typed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    pick(option.value);
                  }}
                >
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export type BulkImportActionBarProps<TRow extends RowData> = Readonly<{
  table: Table<TRow>;
  selectedCount: number;
  categories: string[];
  tags: string[];
  accounts: Option[];
  kinds: Option[];
  onClear: () => void;
  onSetCategory: (category: string) => void;
  onAddTag: (tag: string) => void;
  onSetAccount: (accountId: string) => void;
  onSetKind: (kind: string) => void;
  onSetInclude: (include: boolean) => void;
}>;

export const BulkImportActionBar = <TRow extends RowData>({
  table,
  selectedCount,
  categories,
  tags,
  accounts,
  kinds,
  onClear,
  onSetCategory,
  onAddTag,
  onSetAccount,
  onSetKind,
  onSetInclude,
}: BulkImportActionBarProps<TRow>) => {
  const categoryOptions = useMemo(
    () => categories.map((category) => ({ label: category, value: category })),
    [categories],
  );
  const tagOptions = useMemo(() => tags.map((tag) => ({ label: tag, value: tag })), [tags]);

  return (
    <DataTableActionBar data-grid-popover="" table={table} visible={selectedCount > 0}>
      <div className="flex h-7 items-center rounded-md border pr-1 pl-2.5">
        <span className="text-xs whitespace-nowrap">{selectedCount} selected</span>
        <Separator className="mr-1 ml-2 data-[orientation=vertical]:h-4" orientation="vertical" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="size-5" size="icon" variant="ghost" onClick={onClear}>
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={10}>
            <p>Clear selection</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <Separator
        className="hidden data-[orientation=vertical]:h-5 sm:block"
        orientation="vertical"
      />
      <div className="flex items-center gap-1.5">
        <BulkValuePicker label="Category" options={categoryOptions} onPick={onSetCategory} />
        <BulkValuePicker creatable label="Add tag" options={tagOptions} onPick={onAddTag} />
        <BulkValuePicker label="Account" options={accounts} onPick={onSetAccount} />
        <BulkValuePicker label="Kind" options={kinds} onPick={onSetKind} />
        <DataTableActionBarAction
          tooltip="Leave these out of the import"
          onClick={() => {
            onSetInclude(false);
          }}
        >
          <EyeOff />
          Skip
        </DataTableActionBarAction>
        <DataTableActionBarAction
          tooltip="Put these back in the import"
          onClick={() => {
            onSetInclude(true);
          }}
        >
          <RotateCcw />
          Include
        </DataTableActionBarAction>
      </div>
    </DataTableActionBar>
  );
};
