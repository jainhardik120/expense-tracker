'use client';

import * as React from 'react';

import { type RowData } from '@tanstack/react-table';
import { PlusCircle, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  describeNumberFilter,
  NUMBER_FILTER_LABELS,
  NUMBER_FILTER_OPERATORS,
  type NumberFilterOperator,
  operandCount,
  parseNumberFilter,
  serializeNumberFilter,
} from '@/lib/number-filter';
import type { Column } from '@/lib/table';

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export const DataTableNumberFilter = <TData extends RowData>({
  column,
  title,
}: {
  column: Column<TData, unknown>;
  title: string;
}) => {
  const applied = parseNumberFilter(asStrings(column.getFilterValue()));
  const [open, setOpen] = React.useState(false);
  const [operator, setOperator] = React.useState<NumberFilterOperator>(applied?.operator ?? 'gt');
  const [operands, setOperands] = React.useState<string[]>(applied?.values.map(String) ?? ['', '']);

  const needed = operandCount(operator);
  const draft = parseNumberFilter([operator, ...operands.slice(0, needed)]);

  const apply = () => {
    if (draft === null) {
      return;
    }
    column.setFilterValue(serializeNumberFilter(draft));
    setOpen(false);
  };

  const clear = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    column.setFilterValue(undefined);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setOperator(applied?.operator ?? 'gt');
          setOperands(applied?.values.map(String) ?? ['', '']);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button className="border-dashed" size="sm" variant="outline">
          {applied === null ? (
            <PlusCircle />
          ) : (
            <div
              aria-label={`Clear ${title} filter`}
              className="focus-visible:ring-ring rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
              role="button"
              tabIndex={0}
              onClick={clear}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  clear(event);
                }
              }}
            >
              <XCircle />
            </div>
          )}
          <span>{title}</span>
          {applied === null ? null : (
            <>
              <Separator
                className="mx-0.5 data-[orientation=vertical]:h-4"
                orientation="vertical"
              />
              <span className="tabular-nums">{describeNumberFilter(applied)}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-3">
        <p className="leading-none font-medium">{title}</p>
        <Select
          value={operator}
          onValueChange={(value) => {
            setOperator(value as NumberFilterOperator);
          }}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NUMBER_FILTER_OPERATORS.map((option) => (
              <SelectItem key={option} value={option}>
                {NUMBER_FILTER_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needed === 0 ? null : (
          <div className="flex items-center gap-2">
            {Array.from({ length: needed }, (_, index) => (
              <React.Fragment key={index}>
                {index === 1 ? <span className="text-muted-foreground text-sm">and</span> : null}
                <Input
                  aria-label={index === 0 ? 'Amount' : 'Upper amount'}
                  className="h-8"
                  inputMode="decimal"
                  placeholder="Amount"
                  type="number"
                  value={operands[index] ?? ''}
                  onChange={(event) => {
                    const next = [...operands];
                    next[index] = event.target.value;
                    setOperands(next);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      apply();
                    }
                  }}
                />
              </React.Fragment>
            ))}
          </div>
        )}
        <Button disabled={draft === null} size="sm" onClick={apply}>
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  );
};
