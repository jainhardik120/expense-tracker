'use client';

import * as React from 'react';

import { PlusCircle, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

import type { Column } from '@tanstack/react-table';

interface Range {
  min: number;
  max: number;
}

type RangeValue = [number, number];

const getIsValidRange = (value: unknown): value is RangeValue =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number';

interface DataTableSliderFilterProps<TData> {
  column: Column<TData, unknown>;
  title?: string;
}

export const DataTableSliderFilter = <TData,>({
  column,
  title,
}: DataTableSliderFilterProps<TData>) => {
  const id = React.useId();

  const columnFilterValue = getIsValidRange(column.getFilterValue())
    ? (column.getFilterValue() as RangeValue)
    : undefined;

  const defaultRange = column.columnDef.meta?.range;
  const unit = column.columnDef.meta?.unit;

  const { min, max, step } = React.useMemo<Range & { step: number }>(() => {
    let minValue = 0;
    let maxValue = 100;

    if (defaultRange && getIsValidRange(defaultRange)) {
      [minValue, maxValue] = defaultRange;
    } else {
      const values = column.getFacetedMinMaxValues();
      if (values && Array.isArray(values) && values.length === 2) {
        const [facetMinValue, facetMaxValue] = values;
        if (typeof facetMinValue === 'number' && typeof facetMaxValue === 'number') {
          minValue = facetMinValue;
          maxValue = facetMaxValue;
        }
      }
    }

    const rangeSize = maxValue - minValue;
    const step =
      rangeSize <= 20
        ? 1
        : rangeSize <= 100
          ? Math.ceil(rangeSize / 20)
          : Math.ceil(rangeSize / 50);

    return { min: minValue, max: maxValue, step };
  }, [column, defaultRange]);

  const range = React.useMemo((): RangeValue => {
    return columnFilterValue ?? [min, max];
  }, [columnFilterValue, min, max]);

  const formatValue = React.useCallback((value: number) => {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }, []);

  const onFromInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const numValue = Number(event.target.value);
      if (!Number.isNaN(numValue) && numValue >= min && numValue <= range[1]) {
        column.setFilterValue([numValue, range[1]]);
      }
    },
    [column, min, range],
  );

  const onToInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const numValue = Number(event.target.value);
      if (!Number.isNaN(numValue) && numValue <= max && numValue >= range[0]) {
        column.setFilterValue([range[0], numValue]);
      }
    },
    [column, max, range],
  );

  const onSliderValueChange = React.useCallback(
    (value: RangeValue) => {
      if (Array.isArray(value) && value.length === 2) {
        column.setFilterValue(value);
      }
    },
    [column],
  );

  const onReset = React.useCallback(
    (event: React.MouseEvent) => {
      if (event.target instanceof HTMLDivElement) {
        event.stopPropagation();
      }
      column.setFilterValue(undefined);
    },
    [column],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="border-dashed" size="sm" variant="outline">
          {columnFilterValue ? (
            <div
              aria-label={`Clear ${title} filter`}
              className="focus-visible:ring-ring rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
              role="button"
              tabIndex={0}
              onClick={onReset}
            >
              <XCircle />
            </div>
          ) : (
            <PlusCircle />
          )}
          <span>{title}</span>
          {columnFilterValue ? (
            <>
              <Separator
                className="mx-0.5 data-[orientation=vertical]:h-4"
                orientation="vertical"
              />
              {formatValue(columnFilterValue[0])} - {formatValue(columnFilterValue[1])}
              {unit ? ` ${unit}` : ''}
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto flex-col gap-4">
        <div className="flex flex-col gap-3">
          <p className="leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {title}
          </p>
          <div className="flex items-center gap-4">
            <Label className="sr-only" htmlFor={`${id}-from`}>
              From
            </Label>
            <div className="relative">
              <Input
                aria-valuemax={max}
                aria-valuemin={min}
                className={cn('h-8 w-24', unit && 'pr-8')}
                id={`${id}-from`}
                inputMode="numeric"
                max={max}
                min={min}
                pattern="[0-9]*"
                placeholder={min.toString()}
                type="number"
                value={range[0]?.toString()}
                onChange={onFromInputChange}
              />
              {unit ? (
                <span className="bg-accent text-muted-foreground absolute top-0 right-0 bottom-0 flex items-center rounded-r-md px-2 text-sm">
                  {unit}
                </span>
              ) : null}
            </div>
            <Label className="sr-only" htmlFor={`${id}-to`}>
              to
            </Label>
            <div className="relative">
              <Input
                aria-valuemax={max}
                aria-valuemin={min}
                className={cn('h-8 w-24', unit && 'pr-8')}
                id={`${id}-to`}
                inputMode="numeric"
                max={max}
                min={min}
                pattern="[0-9]*"
                placeholder={max.toString()}
                type="number"
                value={range[1]?.toString()}
                onChange={onToInputChange}
              />
              {unit ? (
                <span className="bg-accent text-muted-foreground absolute top-0 right-0 bottom-0 flex items-center rounded-r-md px-2 text-sm">
                  {unit}
                </span>
              ) : null}
            </div>
          </div>
          <Label className="sr-only" htmlFor={`${id}-slider`}>
            {title} slider
          </Label>
          <Slider
            id={`${id}-slider`}
            max={max}
            min={min}
            step={step}
            value={range}
            onValueChange={onSliderValueChange}
          />
        </div>
        <Button aria-label={`Clear ${title} filter`} size="sm" variant="outline" onClick={onReset}>
          Clear
        </Button>
      </PopoverContent>
    </Popover>
  );
};
