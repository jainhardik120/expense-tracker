/* eslint-disable */

'use client';

import * as React from 'react';

import { ArrowDownUp, ChevronsUpDown, GripVertical, Trash2 } from 'lucide-react';

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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from '@/components/ui/sortable';
import { dataTableConfig } from '@/config/data-table';
import { cn } from '@/lib/utils';

import type { ColumnSort, SortDirection, Table } from '@tanstack/react-table';

const OPEN_MENU_SHORTCUT = 's';
const REMOVE_SORT_SHORTCUTS = ['backspace', 'delete'];

interface DataTableSortListProps<TData> extends React.ComponentProps<typeof PopoverContent> {
  table: Table<TData>;
}

export const DataTableSortList = <TData,>({ table, ...props }: DataTableSortListProps<TData>) => {
  const id = React.useId();
  const labelId = React.useId();
  const descriptionId = React.useId();
  const [open, setOpen] = React.useState(false);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);

  const { sorting } = table.getState();
  const onSortingChange = table.setSorting;

  const { columnLabels, columns } = React.useMemo(() => {
    const labels = new Map<string, string>();
    const sortingIds = new Set(sorting.map((s) => s.id));
    const availableColumns: { id: string; label: string }[] = [];

    for (const column of table.getAllColumns()) {
      if (!column.getCanSort()) {
        continue;
      }

      const label = column.columnDef.meta?.label ?? column.id;
      labels.set(column.id, label);

      if (!sortingIds.has(column.id)) {
        availableColumns.push({ id: column.id, label });
      }
    }

    return {
      columnLabels: labels,
      columns: availableColumns,
    };
  }, [sorting, table]);

  const onSortAdd = React.useCallback(() => {
    const firstColumn = columns[0];
    if (!firstColumn) {
      return;
    }

    onSortingChange((prevSorting) => [...prevSorting, { id: firstColumn.id, desc: false }]);
  }, [columns, onSortingChange]);

  const onSortUpdate = React.useCallback(
    (sortId: string, updates: Partial<ColumnSort>) => {
      onSortingChange((prevSorting) => {
        if (!prevSorting) {
          return prevSorting;
        }
        return prevSorting.map((sort) => (sort.id === sortId ? { ...sort, ...updates } : sort));
      });
    },
    [onSortingChange],
  );

  const onSortRemove = React.useCallback(
    (sortId: string) => {
      onSortingChange((prevSorting) => prevSorting.filter((item) => item.id !== sortId));
    },
    [onSortingChange],
  );

  const onSortingReset = React.useCallback(() => {
    onSortingChange(table.initialState.sorting);
  }, [onSortingChange, table.initialState.sorting]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (
        event.key.toLowerCase() === OPEN_MENU_SHORTCUT &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setOpen(true);
      }

      if (event.key.toLowerCase() === OPEN_MENU_SHORTCUT && event.shiftKey && sorting.length > 0) {
        event.preventDefault();
        onSortingReset();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [sorting.length, onSortingReset]);

  const onTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (REMOVE_SORT_SHORTCUTS.includes(event.key.toLowerCase()) && sorting.length > 0) {
        event.preventDefault();
        onSortingReset();
      }
    },
    [sorting.length, onSortingReset],
  );

  return (
    <Sortable getItemValue={(item) => item.id} value={sorting} onValueChange={onSortingChange}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" onKeyDown={onTriggerKeyDown}>
            <ArrowDownUp />
            Sort
            {sorting.length > 0 && (
              <Badge
                className="h-[18.24px] rounded-[3.2px] px-[5.12px] font-mono text-[10.4px] font-normal"
                variant="secondary"
              >
                {sorting.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          aria-describedby={descriptionId}
          aria-labelledby={labelId}
          className="flex w-full max-w-[var(--radix-popover-content-available-width)] origin-[var(--radix-popover-content-transform-origin)] flex-col gap-3.5 p-4 sm:min-w-[380px]"
          {...props}
        >
          <div className="flex flex-col gap-1">
            <h4 className="leading-none font-medium" id={labelId}>
              {sorting.length > 0 ? 'Sort by' : 'No sorting applied'}
            </h4>
            <p
              className={cn('text-muted-foreground text-sm', sorting.length > 0 && 'sr-only')}
              id={descriptionId}
            >
              {sorting.length > 0
                ? 'Modify sorting to organize your rows.'
                : 'Add sorting to organize your rows.'}
            </p>
          </div>
          {sorting.length > 0 && (
            <SortableContent asChild>
              <ul className="flex max-h-[300px] flex-col gap-2 overflow-y-auto p-1">
                {sorting.map((sort) => (
                  <DataTableSortItem
                    key={sort.id}
                    columnLabels={columnLabels}
                    columns={columns}
                    sort={sort}
                    sortItemId={`${id}-sort-${sort.id}`}
                    onSortRemove={onSortRemove}
                    onSortUpdate={onSortUpdate}
                  />
                ))}
              </ul>
            </SortableContent>
          )}
          <div className="flex w-full items-center gap-2">
            <Button
              ref={addButtonRef}
              className="rounded"
              disabled={columns.length === 0}
              size="sm"
              onClick={onSortAdd}
            >
              Add sort
            </Button>
            {sorting.length > 0 && (
              <Button className="rounded" size="sm" variant="outline" onClick={onSortingReset}>
                Reset sorting
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <SortableOverlay>
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 h-8 w-[180px] rounded-sm" />
          <div className="bg-primary/10 h-8 w-24 rounded-sm" />
          <div className="bg-primary/10 size-8 shrink-0 rounded-sm" />
          <div className="bg-primary/10 size-8 shrink-0 rounded-sm" />
        </div>
      </SortableOverlay>
    </Sortable>
  );
};

interface DataTableSortItemProps {
  sort: ColumnSort;
  sortItemId: string;
  columns: { id: string; label: string }[];
  columnLabels: Map<string, string>;
  onSortUpdate: (sortId: string, updates: Partial<ColumnSort>) => void;
  onSortRemove: (sortId: string) => void;
}

const DataTableSortItem = ({
  sort,
  sortItemId,
  columns,
  columnLabels,
  onSortUpdate,
  onSortRemove,
}: DataTableSortItemProps) => {
  const fieldListboxId = `${sortItemId}-field-listbox`;
  const fieldTriggerId = `${sortItemId}-field-trigger`;
  const directionListboxId = `${sortItemId}-direction-listbox`;

  const [showFieldSelector, setShowFieldSelector] = React.useState(false);
  const [showDirectionSelector, setShowDirectionSelector] = React.useState(false);

  const onItemKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLLIElement>) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (showFieldSelector || showDirectionSelector) {
        return;
      }

      if (REMOVE_SORT_SHORTCUTS.includes(event.key.toLowerCase())) {
        event.preventDefault();
        onSortRemove(sort.id);
      }
    },
    [sort.id, showFieldSelector, showDirectionSelector, onSortRemove],
  );

  return (
    <SortableItem asChild value={sort.id}>
      <li
        className="flex items-center gap-2"
        id={sortItemId}
        tabIndex={-1}
        onKeyDown={onItemKeyDown}
      >
        <Popover open={showFieldSelector} onOpenChange={setShowFieldSelector}>
          <PopoverTrigger asChild>
            <Button
              aria-controls={fieldListboxId}
              className="w-44 justify-between rounded font-normal"
              id={fieldTriggerId}
              size="sm"
              variant="outline"
            >
              <span className="truncate">{columnLabels.get(sort.id)}</span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] origin-[var(--radix-popover-content-transform-origin)] p-0"
            id={fieldListboxId}
          >
            <Command>
              <CommandInput placeholder="Search fields..." />
              <CommandList>
                <CommandEmpty>No fields found.</CommandEmpty>
                <CommandGroup>
                  {columns.map((column) => (
                    <CommandItem
                      key={column.id}
                      value={column.id}
                      onSelect={(value) => {
                        onSortUpdate(sort.id, { id: value });
                      }}
                    >
                      <span className="truncate">{column.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Select
          open={showDirectionSelector}
          value={sort.desc ? 'desc' : 'asc'}
          onOpenChange={setShowDirectionSelector}
          onValueChange={(value: SortDirection) => {
            onSortUpdate(sort.id, { desc: value === 'desc' });
          }}
        >
          <SelectTrigger
            aria-controls={directionListboxId}
            className="h-8 w-24 rounded [&[data-size]]:h-8"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            className="min-w-[var(--radix-select-trigger-width)] origin-[var(--radix-select-content-transform-origin)]"
            id={directionListboxId}
          >
            {dataTableConfig.sortOrders.map((order) => (
              <SelectItem key={order.value} value={order.value}>
                {order.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-controls={sortItemId}
          className="size-8 shrink-0 rounded"
          size="icon"
          variant="outline"
          onClick={() => {
            onSortRemove(sort.id);
          }}
        >
          <Trash2 />
        </Button>
        <SortableItemHandle asChild>
          <Button className="size-8 shrink-0 rounded" size="icon" variant="outline">
            <GripVertical />
          </Button>
        </SortableItemHandle>
      </li>
    </SortableItem>
  );
};
