import { createParser } from 'nuqs/server';
import { z } from 'zod';

import type { ExtendedColumnSort } from '@/types/data-table';

import type { RowData } from '@tanstack/react-table';

const sortingItemSchema = z.object({
  id: z.string(),
  desc: z.boolean(),
});

const createGenericParser = <T extends { id: string }>(
  schema: z.ZodArray<z.ZodType>,
  serializeValue: (value: T[]) => string,
  equalityCheck: (a: T[], b: T[]) => boolean,
  columnIds?: string[] | Set<string>,
) => {
  let validKeys: Set<string> | null = null;

  if (columnIds !== undefined) {
    validKeys = columnIds instanceof Set ? columnIds : new Set(columnIds);
  }

  return createParser({
    parse: (value) => {
      try {
        const parsed: unknown = JSON.parse(value);
        const result = schema.safeParse(parsed);

        if (!result.success) {
          return null;
        }

        const data = result.data as T[];
        if (validKeys !== null && data.some((item) => !validKeys.has(item.id))) {
          return null;
        }

        return data;
      } catch {
        return null;
      }
    },
    serialize: serializeValue,
    eq: equalityCheck,
  });
};

export const getSortingStateParser = <TData extends RowData>(
  columnIds?: string[] | Set<string>,
) => {
  return createGenericParser<ExtendedColumnSort<TData>>(
    z.array(sortingItemSchema),
    (value) => JSON.stringify(value),
    (a, b) =>
      a.length === b.length &&
      a.every((item, index) => item.id === b[index]?.id && item.desc === b[index]?.desc),
    columnIds,
  );
};

export type SortItem<TId extends string = string> = { id: TId; desc: boolean };

export const sortStateParser = <TId extends string = string>(columnIds?: readonly TId[]) =>
  createGenericParser<SortItem<TId>>(
    z.array(sortingItemSchema),
    (value) => JSON.stringify(value),
    (a, b) =>
      a.length === b.length &&
      a.every((item, index) => item.id === b[index]?.id && item.desc === b[index]?.desc),
    columnIds === undefined ? undefined : [...columnIds],
  );
