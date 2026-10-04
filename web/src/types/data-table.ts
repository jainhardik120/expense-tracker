import { type ColumnSort, type RowData, type TableFeatures } from '@tanstack/react-table';

import type { filterVariants } from '@/config/data-table';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TFeatures extends TableFeatures, TData extends RowData, TValue> {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
    icon?: React.FC<React.SVGProps<SVGSVGElement>>;
    align?: 'left' | 'right';
    selectable?: boolean;
  }
}

export interface Option {
  label: string;
  value: string;
  count?: number;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

type FilterVariant = (typeof filterVariants)[number];

export interface ExtendedColumnSort<TData extends RowData> extends Omit<ColumnSort, 'id'> {
  id: Extract<keyof TData, string> | (string & {});
}
