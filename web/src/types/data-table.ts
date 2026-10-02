import type { DataTableConfig } from '@/config/data-table';
import type { FilterItemSchema } from '@/lib/parsers';

import type { ColumnSort, RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
    icon?: React.FC<React.SVGProps<SVGSVGElement>>;
    /**
     * Which edge the column reads from. Money and counts go right, so the
     * decimal points of a column line up and its magnitudes can be compared
     * down the page rather than read one by one.
     */
    align?: 'left' | 'right';
    /**
     * Whether the column takes part in a swept-out cell selection.
     *
     * False for the columns that hold a control rather than a value -- a tick
     * box, a row's menu, a drag handle -- which have nothing to total and
     * nothing worth copying.
     */
    selectable?: boolean;
  }
}

export interface Option {
  label: string;
  value: string;
  count?: number;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

export type FilterVariant = DataTableConfig['filterVariants'][number];

export interface ExtendedColumnSort<TData> extends Omit<ColumnSort, 'id'> {
  /**
   * A column id, which is usually a field of the row but need not be: a column
   * reading `createdAt` may call itself `date`, and a sort names the column
   * rather than the field. Ids are checked against the table's real columns by
   * getSortingStateParser, which is the check that can actually be trusted.
   */
  // The `& {}` keeps the field names as autocomplete suggestions while still
  // admitting any column id. sonarjs reads the intersection as pointless; it is
  // the idiom that makes this union stay a union rather than widening away.
  // eslint-disable-next-line sonarjs/no-useless-intersection
  id: Extract<keyof TData, string> | (string & {});
}

export interface ExtendedColumnFilter<TData> extends FilterItemSchema {
  id: Extract<keyof TData, string>;
}
