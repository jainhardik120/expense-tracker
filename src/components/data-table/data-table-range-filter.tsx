'use client';

import * as React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ExtendedColumnFilter } from '@/types/data-table';

import type { Column } from '@tanstack/react-table';

interface DataTableRangeFilterProps<TData> extends React.ComponentProps<'div'> {
  filter: ExtendedColumnFilter<TData>;
  column: Column<TData>;
  inputId: string;
  onFilterUpdate: (
    filterId: string,
    updates: Partial<Omit<ExtendedColumnFilter<TData>, 'filterId'>>,
  ) => void;
}

export const DataTableRangeFilter = <TData,>({
  filter,
  column,
  inputId,
  onFilterUpdate,
  className,
  ...props
}: DataTableRangeFilterProps<TData>) => {
  const { meta } = column.columnDef;

  const [min, max] = React.useMemo(() => {
    const range = column.columnDef.meta?.range;
    if (range) {
      return range;
    }

    const values = column.getFacetedMinMaxValues();
    if (!values) {
      return [0, 100];
    }

    return [values[0], values[1]];
  }, [column]);

  const formatValue = React.useCallback((value: string | number | undefined) => {
    if (value === undefined || value === '') {
      return '';
    }
    const numValue = Number(value);
    return Number.isNaN(numValue)
      ? ''
      : numValue.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        });
  }, []);

  const value = React.useMemo(() => {
    if (Array.isArray(filter.value)) {
      return filter.value.map(formatValue);
    }
    return [formatValue(filter.value), ''];
  }, [filter.value, formatValue]);

  const onRangeValueChange = React.useCallback(
    (value: string, isMin?: boolean) => {
      const numValue = Number(value);
      const currentValues = Array.isArray(filter.value) ? filter.value : ['', ''];
      const otherValue = isMin ? (currentValues[1] ?? '') : (currentValues[0] ?? '');

      if (
        value === '' ||
        (!Number.isNaN(numValue) &&
          (isMin
            ? numValue >= min && numValue <= (Number(otherValue) || max)
            : numValue <= max && numValue >= (Number(otherValue) || min)))
      ) {
        onFilterUpdate(filter.filterId, {
          value: isMin ? [value, otherValue] : [otherValue, value],
        });
      }
    },
    [filter.filterId, filter.value, min, max, onFilterUpdate],
  );

  return (
    <div className={cn('flex w-full items-center gap-2', className)} data-slot="range" {...props}>
      <Input
        aria-label={`${meta?.label} minimum value`}
        aria-valuemax={max}
        aria-valuemin={min}
        className="h-8 w-full rounded"
        data-slot="range-min"
        defaultValue={value[0]}
        id={`${inputId}-min`}
        inputMode="numeric"
        max={max}
        min={min}
        placeholder={min.toString()}
        type="number"
        onChange={(event) => {
          onRangeValueChange(event.target.value, true);
        }}
      />
      <span className="text-muted-foreground sr-only shrink-0">to</span>
      <Input
        aria-label={`${meta?.label} maximum value`}
        aria-valuemax={max}
        aria-valuemin={min}
        className="h-8 w-full rounded"
        data-slot="range-max"
        defaultValue={value[1]}
        id={`${inputId}-max`}
        inputMode="numeric"
        max={max}
        min={min}
        placeholder={max.toString()}
        type="number"
        onChange={(event) => {
          onRangeValueChange(event.target.value);
        }}
      />
    </div>
  );
};
