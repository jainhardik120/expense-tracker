'use client';

import { Check } from 'lucide-react';

import FullScreenDialog from '@/components/full-screen-dialog';
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
const SHARE_DECIMALS = 1;
const SECTION_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] content-start gap-x-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_6.5rem_6.5rem] sm:gap-x-3';
const SUBGRID = 'col-span-full grid grid-cols-subgrid';
const ROW = cn(SUBGRID, 'items-start py-1.5 sm:py-2.5');
const NAME_CELL = 'min-w-0';
const NUMBER = 'text-right tabular-nums';
const SMALL = 'text-[11px] sm:text-xs';
const MUTED_SMALL = 'text-muted-foreground text-[11px] sm:text-xs';

type Figures = Pick<ColouredSlice, 'value' | 'invested' | 'dayChange'>;

const wholeRupees = (value: number) => formatCurrency(Math.round(value)).replace(/\.00$/, '');

const HUNDREDTH = 0.005;

const signedRupees = (value: number) =>
  formatSignedCurrency(Math.round(value) + 0).replace(/\.00$/, '');

const percentOf = (value: number, base: number) => {
  if (base === 0) {
    return null;
  }
  const percent = (value / base) * PERCENT;
  if (Math.abs(percent) < HUNDREDTH) {
    return formatPercent(0);
  }
  return `${percent > 0 ? '+' : ''}${formatPercent(percent)}`;
};

const shareOf = (value: number, base: number) => (base === 0 ? 0 : (value / base) * PERCENT);

const SignedFigure = ({ value, base }: { value: number; base: number }) => (
  <span className={cn('flex flex-col', NUMBER, getSignedValueTone(Math.round(value)))}>
    <span>{signedRupees(value)}</span>
    <span className={SMALL}>{percentOf(value, base)}</span>
  </span>
);

const FigureCells = ({ figures, shareLabel }: { figures: Figures; shareLabel?: string }) => (
  <>
    <span className={cn('flex flex-col', NUMBER)}>
      <span>{wholeRupees(figures.value)}</span>
      {shareLabel === undefined ? null : <span className={MUTED_SMALL}>{shareLabel}</span>}
    </span>
    <span className={NUMBER}>{wholeRupees(figures.invested)}</span>
    <SignedFigure base={figures.invested} value={figures.value - figures.invested} />
    <SignedFigure base={figures.value - figures.dayChange} value={figures.dayChange} />
  </>
);

const ColumnHeads = ({ title, note }: { title: string; note?: string }) => (
  <div className={cn(SUBGRID, 'gap-y-2 border-b pb-1.5 sm:gap-y-3 sm:pb-2')}>
    <div className="col-span-full flex flex-col gap-0.5">
      <span className="font-medium">{title}</span>
      {note === undefined ? null : <span className={MUTED_SMALL}>{note}</span>}
    </div>
    <span />
    {['Value', 'Invested', 'P/L', '1D'].map((head) => (
      <span key={head} className={cn(MUTED_SMALL, NUMBER)}>
        {head}
      </span>
    ))}
  </div>
);

const ShareBar = ({ share, fill }: { share: number; fill: string }) => (
  <span className="bg-muted mt-1.5 hidden h-1 max-w-48 overflow-hidden rounded-full sm:block">
    <span
      className="block h-full rounded-full"
      style={{ width: `${String(Math.min(share, PERCENT))}%`, backgroundColor: fill }}
    />
  </span>
);

const SliceRow = ({ slice, share }: { slice: ColouredSlice; share: number }) => (
  <div className={ROW}>
    <span className={NAME_CELL}>
      <span className="flex items-start gap-1.5 sm:items-center sm:gap-2">
        <span
          className="mt-0.5 size-2.5 shrink-0 rounded-[2px] sm:mt-0"
          style={{ backgroundColor: slice.fill }}
        />
        <span className="sm:truncate">{slice.label}</span>
      </span>
      <ShareBar fill={slice.fill} share={share} />
    </span>
    <FigureCells figures={slice} shareLabel={formatPercent(share, SHARE_DECIMALS)} />
  </div>
);

const CategoryStats = ({
  category,
  className,
}: {
  category: CategoryFigures;
  className: string;
}) => (
  <span className={cn(MUTED_SMALL, className)}>
    {category.openPositions} open · {category.closedPositions} closed
    {category.xirr === null ? '' : ` · XIRR ${formatPercent(category.xirr)}`}
  </span>
);

const CategoryRow = ({ category }: { category: CategoryFigures }) => (
  <button
    aria-pressed={category.selected}
    className={cn(
      ROW,
      'hover:bg-muted/50 gap-y-0.5 rounded-sm py-2 text-left transition-colors',
      category.selected && 'bg-muted',
    )}
    type="button"
    onClick={category.onToggle}
  >
    <span className={cn(NAME_CELL, 'flex items-start gap-1.5 sm:gap-2')}>
      <span
        className={cn(
          'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border sm:size-4',
          category.selected && 'bg-primary border-primary text-primary-foreground',
        )}
      >
        {category.selected ? <Check className="size-3" /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="sm:truncate">{category.label}</span>
        <CategoryStats category={category} className="hidden sm:block" />
      </span>
    </span>
    <FigureCells figures={category} />
    <CategoryStats category={category} className="col-span-full pl-5 sm:hidden" />
  </button>
);

const SummaryFigure = ({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string | null;
  tone?: string;
}) => (
  <div className="flex flex-col gap-0.5">
    <span className={MUTED_SMALL}>{label}</span>
    <span className={cn('text-base font-semibold tabular-nums sm:text-2xl', tone)}>{value}</span>
    {detail === undefined || detail === null ? null : (
      <span className={cn('tabular-nums', SMALL, tone)}>{detail}</span>
    )}
  </div>
);

const InsideGroup = ({ group }: { group: ColouredGroup }) => (
  <section className={SECTION_GRID}>
    <ColumnHeads
      note={`Shares of the ${wholeRupees(group.value)} in ${group.label.toLowerCase()}, split by what your funds and stocks hold`}
      title={`Inside ${group.label.toLowerCase()}`}
    />
    {[
      { title: 'By type', slices: group.kinds },
      { title: 'By size', slices: group.buckets },
    ]
      .filter((part) => part.slices.length > 0)
      .map((part) => (
        <div key={part.title} className={SUBGRID}>
          <span
            className={cn(
              'text-muted-foreground col-span-full pt-3 pb-0.5 font-medium sm:pt-4 sm:pb-1',
              SMALL,
            )}
          >
            {part.title}
          </span>
          <div className={cn(SUBGRID, 'divide-y')}>
            {part.slices.map((slice) => (
              <SliceRow key={slice.key} share={shareOf(slice.value, group.value)} slice={slice} />
            ))}
          </div>
        </div>
      ))}
  </section>
);

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
    value: groups.reduce((sum, group) => sum + group.value, 0),
    invested: groups.reduce((sum, group) => sum + group.invested, 0),
    dayChange: groups.reduce((sum, group) => sum + group.dayChange, 0),
  };
  const pnl = total.value - total.invested;
  const split = groups.filter((group) => group.kinds.length > 0 || group.buckets.length > 0);
  return (
    <FullScreenDialog
      description={description}
      open={open}
      setOpen={setOpen}
      title="Asset allocation"
      trigger={trigger}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 text-xs sm:gap-8 sm:text-sm">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="grid grid-cols-4 gap-2 sm:gap-4">
            <SummaryFigure label="Current value" value={wholeRupees(total.value)} />
            <SummaryFigure label="Invested" value={wholeRupees(total.invested)} />
            <SummaryFigure
              detail={percentOf(pnl, total.invested)}
              label="Profit / loss"
              tone={getSignedValueTone(Math.round(pnl))}
              value={signedRupees(pnl)}
            />
            <SummaryFigure
              detail={percentOf(total.dayChange, total.value - total.dayChange)}
              label="Today"
              tone={getSignedValueTone(Math.round(total.dayChange))}
              value={signedRupees(total.dayChange)}
            />
          </div>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
            {groups.map((group) => (
              <span
                key={group.key}
                className="h-full"
                style={{ width: `${String(group.share)}%`, backgroundColor: group.fill }}
                title={`${group.label} ${formatPercent(group.share, SHARE_DECIMALS)}`}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-12 gap-y-6 sm:gap-y-10 lg:grid-cols-2">
          <div className="flex flex-col gap-6 sm:gap-10">
            <section className={SECTION_GRID}>
              <ColumnHeads note="Shares of your whole portfolio" title="Asset classes" />
              <div className={cn(SUBGRID, 'divide-y')}>
                {groups.map((group) => (
                  <SliceRow key={group.key} share={group.share} slice={group} />
                ))}
              </div>
            </section>
            <section className={SECTION_GRID}>
              <ColumnHeads
                note="Includes anything left out of the total. Tick to filter the page."
                title="Categories"
              />
              <div className={cn(SUBGRID, 'pt-1')}>
                {categories.map((category) => (
                  <CategoryRow key={category.key} category={category} />
                ))}
              </div>
            </section>
          </div>
          {split.map((group) => (
            <InsideGroup key={group.key} group={group} />
          ))}
        </div>
        <p className={MUTED_SMALL}>
          Estimated changes, such as funds still waiting on their NAV, are not included in this
          breakdown.
        </p>
      </div>
    </FullScreenDialog>
  );
};
