'use client';

import * as React from 'react';

import { type RowData } from '@tanstack/react-table';
import { CalendarIcon, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { DATE_FORMAT } from '@/lib/format';
import type { Column } from '@/lib/table';

import type { DateRange } from 'react-day-picker';

type DateSelection = Date[] | DateRange;

const getIsDateRange = (value: DateSelection): value is DateRange =>
  typeof value === 'object' && !Array.isArray(value);

const parseAsDate = (timestamp: number | string | undefined): Date | undefined => {
  if (timestamp === undefined) {
    return undefined;
  }
  const numericTimestamp = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  const date = new Date(numericTimestamp);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const parseColumnFilterValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'number' || typeof item === 'string') {
        return item;
      }
      return undefined;
    });
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return [value];
  }

  return [];
};

const parseDateRange = (value: unknown): DateRange => {
  const timestamps = parseColumnFilterValue(value);
  return {
    from: parseAsDate(timestamps[0]),
    to: parseAsDate(timestamps[1]),
  };
};

const parseDateList = (value: unknown): Date[] => {
  const date = parseAsDate(parseColumnFilterValue(value)[0]);
  return date === undefined ? [] : [date];
};

interface DataTableDateFilterProps<TData extends RowData> {
  column: Column<TData, unknown>;
  title?: string;
  multiple?: boolean;
}

export const DataTableDateFilter = <TData extends RowData>({
  column,
  title,
  multiple,
}: DataTableDateFilterProps<TData>) => {
  const columnFilterValue = column.getFilterValue();

  const selectedDates = React.useMemo<DateSelection>(
    () =>
      multiple === true ? parseDateRange(columnFilterValue) : parseDateList(columnFilterValue),
    [columnFilterValue, multiple],
  );

  const onSelect = React.useCallback(
    (date: Date | DateRange | undefined) => {
      if (date === undefined) {
        column.setFilterValue(undefined);
        return;
      }

      if (multiple === true && !('getTime' in date)) {
        const from = date.from?.getTime();
        const to = date.to?.getTime();
        column.setFilterValue(from !== undefined || to !== undefined ? [from, to] : undefined);
      } else if (multiple !== true && 'getTime' in date) {
        column.setFilterValue(date.getTime());
      }
    },
    [column, multiple],
  );

  const onReset = React.useCallback(
    (event: React.SyntheticEvent) => {
      event.stopPropagation();
      column.setFilterValue(undefined);
    },
    [column],
  );

  const hasValue = React.useMemo(() => {
    if (multiple === true) {
      if (!getIsDateRange(selectedDates)) {
        return false;
      }
      return selectedDates.from !== undefined || selectedDates.to !== undefined;
    }
    if (!Array.isArray(selectedDates)) {
      return false;
    }
    return selectedDates.length > 0;
  }, [multiple, selectedDates]);

  const zoned = useZonedFormat();
  const formatDate = React.useCallback(
    (date: Date | undefined) => (date === undefined ? '' : zoned(date, DATE_FORMAT.date)),
    [zoned],
  );

  const formatDateRange = React.useCallback(
    (range: DateRange) => {
      if (range.from === undefined && range.to === undefined) {
        return '';
      }
      if (range.from !== undefined && range.to !== undefined) {
        return `${formatDate(range.from)} - ${formatDate(range.to)}`;
      }
      return formatDate(range.from ?? range.to);
    },
    [formatDate],
  );

  const label = React.useMemo(() => {
    if (multiple === true) {
      if (!getIsDateRange(selectedDates)) {
        return null;
      }

      const hasSelectedDates = selectedDates.from ?? selectedDates.to;
      const dateText =
        hasSelectedDates === undefined ? 'Select date range' : formatDateRange(selectedDates);

      return (
        <span className="flex items-center gap-2">
          <span>{title}</span>
          {hasSelectedDates !== undefined && (
            <>
              <Separator
                className="mx-0.5 data-[orientation=vertical]:h-4"
                orientation="vertical"
              />
              <span>{dateText}</span>
            </>
          )}
        </span>
      );
    }

    if (getIsDateRange(selectedDates)) {
      return null;
    }

    const hasSelectedDate = selectedDates.length > 0;
    const dateText = hasSelectedDate ? formatDate(selectedDates[0]) : 'Select date';

    return (
      <span className="flex items-center gap-2">
        <span>{title}</span>
        {hasSelectedDate ? (
          <>
            <Separator className="mx-0.5 data-[orientation=vertical]:h-4" orientation="vertical" />
            <span>{dateText}</span>
          </>
        ) : null}
      </span>
    );
  }, [selectedDates, multiple, formatDate, formatDateRange, title]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="border-dashed" size="sm" variant="outline">
          {hasValue ? (
            <div
              aria-label={`Clear ${title} filter`}
              className="focus-visible:ring-ring rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
              role="button"
              tabIndex={0}
              onClick={onReset}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onReset(event);
                }
              }}
            >
              <XCircle />
            </div>
          ) : (
            <CalendarIcon />
          )}
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {multiple === true ? (
          <Calendar
            mode="range"
            selected={
              getIsDateRange(selectedDates) ? selectedDates : { from: undefined, to: undefined }
            }
            onSelect={onSelect}
          />
        ) : (
          <Calendar
            mode="single"
            selected={getIsDateRange(selectedDates) ? undefined : selectedDates[0]}
            onSelect={onSelect}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};
