'use client';

import Modal from '@/components/modal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type AllocationSlice } from '@/lib/asset-allocation';
import { formatCurrency, formatPercent, formatSignedCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { getSignedValueTone } from './investment-columns';

export type ColouredSlice = AllocationSlice & { fill: string };

export type CategoryFigures = {
  key: string;
  label: string;
  value: number;
  invested: number;
  dayChange: number;
  xirr: number | null;
  openPositions: number;
  closedPositions: number;
  selected: boolean;
  onToggle: () => void;
};

export type ColouredGroup = ColouredSlice & { kinds: ColouredSlice[]; buckets: ColouredSlice[] };

const PERCENT = 100;
const COLUMN_COUNT = 5;
const SHARE_DECIMALS = 1;
const NUMBER_CELL = 'text-right align-top tabular-nums';
const NUMBER_HEAD = 'text-right';
const SHEET_HEIGHT =
  'pb-4 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:h-[96dvh] data-[vaul-drawer-direction=bottom]:max-h-[96dvh]';
const CELL_SPACING = 'px-1 py-1.5 sm:px-2';

const wholeRupees = (value: number) => formatCurrency(Math.round(value)).replace(/\.00$/, '');

const signedRupees = (value: number) =>
  formatSignedCurrency(Math.round(value)).replace(/\.00$/, '');

const percentOf = (value: number, base: number) => {
  if (base === 0) {
    return null;
  }
  return `${value > 0 ? '+' : ''}${formatPercent((value / base) * PERCENT)}`;
};

const SignedFigure = ({ value, base }: { value: number; base: number }) => (
  <span className={cn('flex flex-col', getSignedValueTone(Math.round(value)))}>
    <span>{signedRupees(value)}</span>
    <span className="text-[11px]">{percentOf(value, base)}</span>
  </span>
);

const AllocationRow = ({
  slice,
  nested = false,
  bold = false,
}: {
  slice: Pick<ColouredSlice, 'label' | 'value' | 'invested' | 'dayChange'> & {
    fill?: string;
    share?: number;
  };
  nested?: boolean;
  bold?: boolean;
}) => (
  <TableRow className={cn(bold && 'font-medium')}>
    <TableCell
      className={cn(CELL_SPACING, 'align-top whitespace-normal', nested && 'pl-3 sm:pl-6')}
    >
      <span className="flex items-center gap-1.5">
        {slice.fill === undefined ? null : (
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: slice.fill }}
          />
        )}
        <span className={cn(nested && 'text-muted-foreground')}>{slice.label}</span>
      </span>
    </TableCell>
    <TableCell className={cn(CELL_SPACING, NUMBER_CELL)}>
      <span className="flex flex-col">
        <span>{wholeRupees(slice.value)}</span>
        {slice.share === undefined ? null : (
          <span className="text-muted-foreground text-[11px]">
            {formatPercent(slice.share, SHARE_DECIMALS)}
          </span>
        )}
      </span>
    </TableCell>
    <TableCell className={cn(CELL_SPACING, NUMBER_CELL)}>{wholeRupees(slice.invested)}</TableCell>
    <TableCell className={cn(CELL_SPACING, NUMBER_CELL)}>
      <SignedFigure base={slice.invested} value={slice.value - slice.invested} />
    </TableCell>
    <TableCell className={cn(CELL_SPACING, NUMBER_CELL)}>
      <SignedFigure base={slice.value - slice.dayChange} value={slice.dayChange} />
    </TableCell>
  </TableRow>
);

const CategoryRow = ({
  category,
  selected,
  onToggle,
}: {
  category: CategoryFigures;
  selected: boolean;
  onToggle: () => void;
}) => (
  <TableRow className={cn('cursor-pointer', selected && 'bg-muted')} onClick={onToggle}>
    <TableCell className={cn(CELL_SPACING, 'align-top whitespace-normal')}>
      <div>{category.label}</div>
      <div className="text-muted-foreground text-[11px]">
        {category.openPositions} open / {category.closedPositions} closed
        {category.xirr === null ? '' : ` · XIRR ${formatPercent(category.xirr)}`}
      </div>
    </TableCell>
    <TableCell className={cn(CELL_SPACING, NUMBER_CELL)}>{wholeRupees(category.value)}</TableCell>
    <TableCell className={cn(CELL_SPACING, NUMBER_CELL)}>
      {wholeRupees(category.invested)}
    </TableCell>
    <TableCell className={cn(CELL_SPACING, NUMBER_CELL)}>
      <SignedFigure base={category.invested} value={category.value - category.invested} />
    </TableCell>
    <TableCell className={cn(CELL_SPACING, NUMBER_CELL)}>
      <SignedFigure base={category.value - category.dayChange} value={category.dayChange} />
    </TableCell>
  </TableRow>
);

const SectionRow = ({ label }: { label: string }) => (
  <TableRow className="hover:bg-transparent">
    <TableCell
      className="text-muted-foreground pt-2 pb-0.5 pl-3 text-[11px] sm:pl-6"
      colSpan={COLUMN_COUNT}
    >
      {label}
    </TableCell>
  </TableRow>
);

const groupRows = (group: ColouredGroup): React.ReactNode[] => [
  <AllocationRow key={group.key} slice={group} />,
  ...(group.kinds.length === 0 ? [] : [<SectionRow key={`${group.key}:kinds`} label="By type" />]),
  ...group.kinds.map((kind) => <AllocationRow key={kind.key} nested slice={kind} />),
  ...(group.buckets.length === 0
    ? []
    : [<SectionRow key={`${group.key}:buckets`} label="By size" />]),
  ...group.buckets.map((bucket) => <AllocationRow key={bucket.key} nested slice={bucket} />),
];

export const AssetAllocationDialog = ({
  groups,
  categories,
  description,
  open,
  setOpen,
  trigger,
}: {
  groups: ColouredGroup[];
  categories: CategoryFigures[];
  description?: string;
  open: boolean;
  setOpen: React.Dispatch<boolean>;
  trigger: React.ReactNode;
}) => {
  const total = {
    label: 'Total',
    share: PERCENT,
    value: groups.reduce((sum, group) => sum + group.value, 0),
    invested: groups.reduce((sum, group) => sum + group.invested, 0),
    dayChange: groups.reduce((sum, group) => sum + group.dayChange, 0),
  };
  return (
    <Modal
      className="sm:max-w-2xl"
      description={description}
      drawerClassName={SHEET_HEIGHT}
      open={open}
      setOpen={setOpen}
      title="Asset allocation"
      trigger={trigger}
    >
      <div className="min-h-0 overflow-y-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className={CELL_SPACING}>Asset</TableHead>
              <TableHead className={cn(CELL_SPACING, NUMBER_HEAD)}>Current</TableHead>
              <TableHead className={cn(CELL_SPACING, NUMBER_HEAD)}>Invested</TableHead>
              <TableHead className={cn(CELL_SPACING, NUMBER_HEAD)}>P/L</TableHead>
              <TableHead className={cn(CELL_SPACING, NUMBER_HEAD)}>1D</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.flatMap(groupRows)}
            <AllocationRow bold slice={total} />
            <TableRow className="hover:bg-transparent">
              <TableCell
                className="text-muted-foreground pt-4 pb-0.5 text-[11px]"
                colSpan={COLUMN_COUNT}
              >
                By category, including anything left out of Total · tap to filter the page
              </TableCell>
            </TableRow>
            {categories.map((category) => (
              <CategoryRow
                key={category.key}
                category={category}
                selected={category.selected}
                onToggle={category.onToggle}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </Modal>
  );
};
