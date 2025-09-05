/* eslint-disable import/max-dependencies */
'use client';

import * as React from 'react';

import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  GripVertical,
  ListFilter,
  Trash2,
} from 'lucide-react';
import { parseAsStringEnum, useQueryState } from 'nuqs';

import { DataTableRangeFilter } from '@/components/data-table/data-table-range-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Faceted,
  FacetedBadgeList,
  FacetedContent,
  FacetedEmpty,
  FacetedGroup,
  FacetedInput,
  FacetedItem,
  FacetedList,
  FacetedTrigger,
} from '@/components/ui/faceted';
import { Input } from '@/components/ui/input';
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
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { getDefaultFilterOperator, getFilterOperators } from '@/lib/data-table';
import { formatDate } from '@/lib/format';
import { generateId } from '@/lib/id';
import { getFiltersStateParser } from '@/lib/parsers';
import { cn } from '@/lib/utils';
import type { ExtendedColumnFilter, FilterOperator, JoinOperator } from '@/types/data-table';

import type { Column, ColumnMeta, Table } from '@tanstack/react-table';

const FILTERS_KEY = 'filters';
const JOIN_OPERATOR_KEY = 'joinOperator';
const DEBOUNCE_MS = 300;
const THROTTLE_MS = 50;
const OPEN_MENU_SHORTCUT = 'f';
const REMOVE_FILTER_SHORTCUTS = ['backspace', 'delete'];

interface DataTableFilterListProps<TData> extends React.ComponentProps<typeof PopoverContent> {
  table: Table<TData>;
  debounceMs?: number;
  throttleMs?: number;
  shallow?: boolean;
}

export const DataTableFilterList = <TData,>({
  table,
  debounceMs = DEBOUNCE_MS,
  throttleMs = THROTTLE_MS,
  shallow = true,
  ...props
}: DataTableFilterListProps<TData>) => {
  const id = React.useId();
  const labelId = React.useId();
  const descriptionId = React.useId();
  const [open, setOpen] = React.useState(false);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);

  const columns = React.useMemo(() => {
    return table.getAllColumns().filter((column) => column.columnDef.enableColumnFilter);
  }, [table]);

  const [filters, setFilters] = useQueryState(
    FILTERS_KEY,
    getFiltersStateParser<TData>(columns.map((field) => field.id))
      .withDefault([])
      .withOptions({
        clearOnDefault: true,
        shallow,
        throttleMs,
      }),
  );
  const debouncedSetFilters = useDebouncedCallback(setFilters, debounceMs);

  const [joinOperator, setJoinOperator] = useQueryState(
    JOIN_OPERATOR_KEY,
    parseAsStringEnum(['and', 'or']).withDefault('and').withOptions({
      clearOnDefault: true,
      shallow,
    }),
  );

  const onFilterAdd = React.useCallback(() => {
    const column = columns[0];

    if (!column) {
      return;
    }

    debouncedSetFilters([
      ...filters,
      {
        id: column.id as Extract<keyof TData, string>,
        value: '',
        variant: column.columnDef.meta?.variant ?? 'text',
        operator: getDefaultFilterOperator(column.columnDef.meta?.variant ?? 'text'),
        filterId: generateId({ length: 8 }),
      },
    ]);
  }, [columns, filters, debouncedSetFilters]);

  const onFilterUpdate = React.useCallback(
    (filterId: string, updates: Partial<Omit<ExtendedColumnFilter<TData>, 'filterId'>>) => {
      debouncedSetFilters((prevFilters) => {
        return prevFilters.map((filter) => {
          if (filter.filterId === filterId) {
            return { ...filter, ...updates } as ExtendedColumnFilter<TData>;
          }
          return filter;
        });
      });
    },
    [debouncedSetFilters],
  );

  const onFilterRemove = React.useCallback(
    (filterId: string) => {
      const updatedFilters = filters.filter((filter) => filter.filterId !== filterId);
      void setFilters(updatedFilters);
      requestAnimationFrame(() => {
        addButtonRef.current?.focus();
      });
    },
    [filters, setFilters],
  );

  const onFiltersReset = React.useCallback(() => {
    void setFilters(null);
    void setJoinOperator('and');
  }, [setFilters, setJoinOperator]);

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

      if (event.key.toLowerCase() === OPEN_MENU_SHORTCUT && event.shiftKey && filters.length > 0) {
        event.preventDefault();
        onFilterRemove(filters[filters.length - 1]?.filterId ?? '');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [filters, onFilterRemove]);

  const onTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (REMOVE_FILTER_SHORTCUTS.includes(event.key.toLowerCase()) && filters.length > 0) {
        event.preventDefault();
        onFilterRemove(filters[filters.length - 1]?.filterId ?? '');
      }
    },
    [filters, onFilterRemove],
  );

  return (
    <Sortable getItemValue={(item) => item.filterId} value={filters} onValueChange={setFilters}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" onKeyDown={onTriggerKeyDown}>
            <ListFilter />
            Filter
            {filters.length > 0 && (
              <Badge
                className="h-[18.24px] rounded-[3.2px] px-[5.12px] font-mono text-[10.4px] font-normal"
                variant="secondary"
              >
                {filters.length}
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
              {filters.length > 0 ? 'Filters' : 'No filters applied'}
            </h4>
            <p
              className={cn('text-muted-foreground text-sm', filters.length > 0 && 'sr-only')}
              id={descriptionId}
            >
              {filters.length > 0
                ? 'Modify filters to refine your rows.'
                : 'Add filters to refine your rows.'}
            </p>
          </div>
          {filters.length > 0 ? (
            <SortableContent asChild>
              <ul className="flex max-h-[300px] flex-col gap-2 overflow-y-auto p-1">
                {filters.map((filter, index) => (
                  <DataTableFilterItem<TData>
                    key={filter.filterId}
                    columns={columns}
                    filter={filter}
                    filterItemId={`${id}-filter-${filter.filterId}`}
                    index={index}
                    joinOperator={joinOperator}
                    setJoinOperator={setJoinOperator}
                    onFilterRemove={onFilterRemove}
                    onFilterUpdate={onFilterUpdate}
                  />
                ))}
              </ul>
            </SortableContent>
          ) : null}
          <div className="flex w-full items-center gap-2">
            <Button ref={addButtonRef} className="rounded" size="sm" onClick={onFilterAdd}>
              Add filter
            </Button>
            {filters.length > 0 ? (
              <Button className="rounded" size="sm" variant="outline" onClick={onFiltersReset}>
                Reset filters
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      <SortableOverlay>
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 h-8 min-w-[72px] rounded-sm" />
          <div className="bg-primary/10 h-8 w-32 rounded-sm" />
          <div className="bg-primary/10 h-8 w-32 rounded-sm" />
          <div className="bg-primary/10 h-8 min-w-36 flex-1 rounded-sm" />
          <div className="bg-primary/10 size-8 shrink-0 rounded-sm" />
          <div className="bg-primary/10 size-8 shrink-0 rounded-sm" />
        </div>
      </SortableOverlay>
    </Sortable>
  );
};

interface DataTableFilterItemProps<TData> {
  filter: ExtendedColumnFilter<TData>;
  index: number;
  filterItemId: string;
  joinOperator: JoinOperator;
  setJoinOperator: (value: JoinOperator) => void;
  columns: Column<TData>[];
  onFilterUpdate: (
    filterId: string,
    updates: Partial<Omit<ExtendedColumnFilter<TData>, 'filterId'>>,
  ) => void;
  onFilterRemove: (filterId: string) => void;
}

const DataTableFilterItem = <TData,>({
  filter,
  index,
  filterItemId,
  joinOperator,
  setJoinOperator,
  columns,
  onFilterUpdate,
  onFilterRemove,
}: DataTableFilterItemProps<TData>) => {
  const [showFieldSelector, setShowFieldSelector] = React.useState(false);
  const [showOperatorSelector, setShowOperatorSelector] = React.useState(false);
  const [showValueSelector, setShowValueSelector] = React.useState(false);

  const column = columns.find((column) => column.id === filter.id);

  const joinOperatorListboxId = `${filterItemId}-join-operator-listbox`;
  const fieldListboxId = `${filterItemId}-field-listbox`;
  const operatorListboxId = `${filterItemId}-operator-listbox`;
  const inputId = `${filterItemId}-input`;

  const columnMeta = column?.columnDef.meta;
  const filterOperators = getFilterOperators(filter.variant);

  const onItemKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLLIElement>) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (showFieldSelector || showOperatorSelector || showValueSelector) {
        return;
      }

      if (REMOVE_FILTER_SHORTCUTS.includes(event.key.toLowerCase())) {
        event.preventDefault();
        onFilterRemove(filter.filterId);
      }
    },
    [filter.filterId, showFieldSelector, showOperatorSelector, showValueSelector, onFilterRemove],
  );

  if (!column) {
    return null;
  }

  return (
    <SortableItem asChild value={filter.filterId}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <li
        className="flex items-center gap-2"
        id={filterItemId}
        tabIndex={-1}
        onKeyDown={onItemKeyDown}
      >
        <div className="min-w-[72px] text-center">
          {index === 0 ? (
            <span className="text-muted-foreground text-sm">Where</span>
          ) : index === 1 ? (
            <Select
              value={joinOperator}
              onValueChange={(value: JoinOperator) => {
                setJoinOperator(value);
              }}
            >
              <SelectTrigger
                aria-controls={joinOperatorListboxId}
                aria-label="Select join operator"
                className="h-8 rounded lowercase [&[data-size]]:h-8"
              >
                <SelectValue placeholder={joinOperator} />
              </SelectTrigger>
              <SelectContent
                className="min-w-(--radix-select-trigger-width) lowercase"
                id={joinOperatorListboxId}
                position="popper"
              >
                {dataTableConfig.joinOperators.map((joinOperator) => (
                  <SelectItem key={joinOperator} value={joinOperator}>
                    {joinOperator}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-muted-foreground text-sm">{joinOperator}</span>
          )}
        </div>
        <Popover open={showFieldSelector} onOpenChange={setShowFieldSelector}>
          <PopoverTrigger asChild>
            <Button
              aria-controls={fieldListboxId}
              className="w-32 justify-between rounded font-normal"
              size="sm"
              variant="outline"
            >
              <span className="truncate">
                {columns.find((column) => column.id === filter.id)?.columnDef.meta?.label ??
                  'Select field'}
              </span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-40 origin-[var(--radix-popover-content-transform-origin)] p-0"
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
                        onFilterUpdate(filter.filterId, {
                          id: value as Extract<keyof TData, string>,
                          variant: column.columnDef.meta?.variant ?? 'text',
                          operator: getDefaultFilterOperator(
                            column.columnDef.meta?.variant ?? 'text',
                          ),
                          value: '',
                        });

                        setShowFieldSelector(false);
                      }}
                    >
                      <span className="truncate">{column.columnDef.meta?.label}</span>
                      <Check
                        className={cn(
                          'ml-auto',
                          column.id === filter.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Select
          open={showOperatorSelector}
          value={filter.operator}
          onOpenChange={setShowOperatorSelector}
          onValueChange={(value: FilterOperator) => {
            onFilterUpdate(filter.filterId, {
              operator: value,
              value: value === 'isEmpty' || value === 'isNotEmpty' ? '' : filter.value,
            });
          }}
        >
          <SelectTrigger
            aria-controls={operatorListboxId}
            className="h-8 w-32 rounded lowercase [&[data-size]]:h-8"
          >
            <div className="truncate">
              <SelectValue placeholder={filter.operator} />
            </div>
          </SelectTrigger>
          <SelectContent
            className="origin-[var(--radix-select-content-transform-origin)]"
            id={operatorListboxId}
          >
            {filterOperators.map((operator) => (
              <SelectItem key={operator.value} className="lowercase" value={operator.value}>
                {operator.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="min-w-36 flex-1">
          {onFilterInputRender({
            filter,
            inputId,
            column,
            columnMeta,
            onFilterUpdate,
            showValueSelector,
            setShowValueSelector,
          })}
        </div>
        <Button
          aria-controls={filterItemId}
          className="size-8 rounded"
          size="icon"
          variant="outline"
          onClick={() => {
            onFilterRemove(filter.filterId);
          }}
        >
          <Trash2 />
        </Button>
        <SortableItemHandle asChild>
          <Button className="size-8 rounded" size="icon" variant="outline">
            <GripVertical />
          </Button>
        </SortableItemHandle>
      </li>
    </SortableItem>
  );
};

const onFilterInputRender = <TData,>({
  filter,
  inputId,
  column,
  columnMeta,
  onFilterUpdate,
  showValueSelector,
  setShowValueSelector,
}: {
  filter: ExtendedColumnFilter<TData>;
  inputId: string;
  column: Column<TData>;
  columnMeta?: ColumnMeta<TData, unknown>;
  onFilterUpdate: (
    filterId: string,
    updates: Partial<Omit<ExtendedColumnFilter<TData>, 'filterId'>>,
  ) => void;
  showValueSelector: boolean;
  setShowValueSelector: (value: boolean) => void;
  // eslint-disable-next-line sonarjs/cognitive-complexity
}) => {
  if (filter.operator === 'isEmpty' || filter.operator === 'isNotEmpty') {
    return (
      <div
        aria-label={`${columnMeta?.label} filter is ${
          filter.operator === 'isEmpty' ? 'empty' : 'not empty'
        }`}
        aria-live="polite"
        className="dark:bg-input/30 h-8 w-full rounded border bg-transparent"
        id={inputId}
        role="status"
      />
    );
  }

  switch (filter.variant) {
    case 'text':
    case 'number':
    case 'range': {
      if (
        (filter.variant === 'range' && filter.operator === 'isBetween') ||
        filter.operator === 'isBetween'
      ) {
        return (
          <DataTableRangeFilter
            column={column}
            filter={filter}
            inputId={inputId}
            onFilterUpdate={onFilterUpdate}
          />
        );
      }

      const isNumber = filter.variant === 'number' || filter.variant === 'range';

      return (
        <Input
          aria-describedby={`${inputId}-description`}
          aria-label={`${columnMeta?.label} filter value`}
          className="h-8 w-full rounded"
          defaultValue={typeof filter.value === 'string' ? filter.value : undefined}
          id={inputId}
          inputMode={isNumber ? 'numeric' : undefined}
          placeholder={columnMeta?.placeholder ?? 'Enter a value...'}
          type={isNumber ? 'number' : filter.variant}
          onChange={(event) => {
            onFilterUpdate(filter.filterId, {
              value: event.target.value,
            });
          }}
        />
      );
    }

    case 'boolean': {
      if (Array.isArray(filter.value)) {
        return null;
      }

      const inputListboxId = `${inputId}-listbox`;

      return (
        <Select
          open={showValueSelector}
          value={filter.value}
          onOpenChange={setShowValueSelector}
          onValueChange={(value) => {
            onFilterUpdate(filter.filterId, {
              value,
            });
          }}
        >
          <SelectTrigger
            aria-controls={inputListboxId}
            aria-label={`${columnMeta?.label} boolean filter`}
            className="h-8 w-full rounded [&[data-size]]:h-8"
            id={inputId}
          >
            <SelectValue placeholder={filter.value ? 'True' : 'False'} />
          </SelectTrigger>
          <SelectContent id={inputListboxId}>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    case 'select':
    case 'multiSelect': {
      const inputListboxId = `${inputId}-listbox`;

      const multiple = filter.variant === 'multiSelect';
      const selectedValues = multiple
        ? Array.isArray(filter.value)
          ? filter.value
          : []
        : typeof filter.value === 'string'
          ? filter.value
          : undefined;

      return (
        <Faceted
          multiple={multiple}
          open={showValueSelector}
          value={selectedValues}
          onOpenChange={setShowValueSelector}
          onValueChange={(value) => {
            onFilterUpdate(filter.filterId, {
              value,
            });
          }}
        >
          <FacetedTrigger asChild>
            <Button
              aria-controls={inputListboxId}
              aria-label={`${columnMeta?.label} filter value${multiple ? 's' : ''}`}
              className="w-full rounded font-normal"
              id={inputId}
              size="sm"
              variant="outline"
            >
              <FacetedBadgeList
                options={columnMeta?.options}
                placeholder={columnMeta?.placeholder ?? `Select option${multiple ? 's' : ''}...`}
              />
            </Button>
          </FacetedTrigger>
          <FacetedContent
            className="w-[200px] origin-[var(--radix-popover-content-transform-origin)]"
            id={inputListboxId}
          >
            <FacetedInput
              aria-label={`Search ${columnMeta?.label} options`}
              placeholder={columnMeta?.placeholder ?? 'Search options...'}
            />
            <FacetedList>
              <FacetedEmpty>No options found.</FacetedEmpty>
              <FacetedGroup>
                {columnMeta?.options?.map((option) => (
                  <FacetedItem key={option.value} value={option.value}>
                    {option.icon ? <option.icon /> : null}
                    <span>{option.label}</span>
                    {option.count ? (
                      <span className="ml-auto font-mono text-xs">{option.count}</span>
                    ) : null}
                  </FacetedItem>
                ))}
              </FacetedGroup>
            </FacetedList>
          </FacetedContent>
        </Faceted>
      );
    }

    case 'date':
    case 'dateRange': {
      const inputListboxId = `${inputId}-listbox`;

      const dateValue = Array.isArray(filter.value)
        ? filter.value.filter(Boolean)
        : [filter.value, filter.value].filter(Boolean);

      const displayValue =
        filter.operator === 'isBetween' && dateValue.length === 2
          ? `${formatDate(new Date(Number(dateValue[0])))} - ${formatDate(
              new Date(Number(dateValue[1])),
            )}`
          : dateValue[0]
            ? formatDate(new Date(Number(dateValue[0])))
            : 'Pick a date';

      return (
        <Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
          <PopoverTrigger asChild>
            <Button
              aria-controls={inputListboxId}
              aria-label={`${columnMeta?.label} date filter`}
              className={cn(
                'w-full justify-start rounded text-left font-normal',
                !filter.value && 'text-muted-foreground',
              )}
              id={inputId}
              size="sm"
              variant="outline"
            >
              <CalendarIcon />
              <span className="truncate">{displayValue}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto origin-[var(--radix-popover-content-transform-origin)] p-0"
            id={inputListboxId}
          >
            {filter.operator === 'isBetween' ? (
              <Calendar
                aria-label={`Select ${columnMeta?.label} date range`}
                initialFocus
                mode="range"
                selected={
                  dateValue.length === 2
                    ? {
                        from: new Date(Number(dateValue[0])),
                        to: new Date(Number(dateValue[1])),
                      }
                    : {
                        from: new Date(),
                        to: new Date(),
                      }
                }
                onSelect={(date) => {
                  onFilterUpdate(filter.filterId, {
                    value: date
                      ? [
                          (date.from?.getTime() ?? '').toString(),
                          (date.to?.getTime() ?? '').toString(),
                        ]
                      : [],
                  });
                }}
              />
            ) : (
              <Calendar
                aria-label={`Select ${columnMeta?.label} date`}
                initialFocus
                mode="single"
                selected={dateValue[0] ? new Date(Number(dateValue[0])) : undefined}
                onSelect={(date) => {
                  onFilterUpdate(filter.filterId, {
                    value: (date?.getTime() ?? '').toString(),
                  });
                }}
              />
            )}
          </PopoverContent>
        </Popover>
      );
    }

    default:
      return null;
  }
};
