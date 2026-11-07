'use client';

import { formatCurrency, formatPercent, formatSignedCurrency } from '@/lib/format';
import { PORTFOLIO_VIEW, toCategoryViewValue, toViewValue } from '@/lib/investment-selection';
import { investmentCategoryLabels, investmentKindLabels } from '@/lib/investments';
import { cn } from '@/lib/utils';
import { type RouterOutput } from '@/server/routers';

import { getExcludedPortfolioTag } from './display';
import { getSignedValueTone } from './investment-columns';

type DashboardData = RouterOutput['investments']['getInvestmentsInitialData']['dashboard'];

type ViewFigures = {
  valuationAmount: number;
  pnl: number;
  pnlPercentage: number | null;
  dayChange: number;
  dayChangePercentage: number | null;
};

type ViewOption = {
  value: string;
  label: string;
  currency: string;
  closed: boolean;
  figures: ViewFigures;
};

const INR = 'INR';

const amount = (value: number, currency: string) =>
  currency === INR
    ? formatCurrency(Math.round(value)).replace(/\.00$/, '')
    : formatCurrency(value, currency);

const signedAmount = (value: number, currency: string) =>
  currency === INR
    ? formatSignedCurrency(Math.round(value) + 0).replace(/\.00$/, '')
    : formatSignedCurrency(value, currency);

const signedPercent = (value: number | null) => {
  if (value === null) {
    return '';
  }
  return ` · ${value > 0 ? '+' : ''}${formatPercent(value)}`;
};

const ViewRow = ({
  option,
  selected,
  onSelect,
}: {
  option: ViewOption;
  selected: boolean;
  onSelect: (value: string) => void;
}) => {
  const { figures, currency } = option;
  return (
    <button
      aria-pressed={selected}
      className={cn(
        'hover:bg-muted/50 flex w-full items-start justify-between gap-3 rounded-sm px-2 py-2 text-left text-sm transition-colors',
        selected && 'bg-muted',
        option.closed && !selected && 'text-muted-foreground',
      )}
      type="button"
      onClick={() => {
        onSelect(option.value);
      }}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate">{option.label}</span>
        <span className={cn('text-xs tabular-nums', getSignedValueTone(Math.round(figures.pnl)))}>
          {option.closed ? 'Realised ' : 'P/L '}
          {signedAmount(figures.pnl, currency)}
          {option.closed ? '' : signedPercent(figures.pnlPercentage)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
        <span className="font-medium">
          {option.closed ? 'Closed' : amount(figures.valuationAmount, currency)}
        </span>
        {option.closed ? null : (
          <span className={cn('text-xs', getSignedValueTone(Math.round(figures.dayChange)))}>
            1D {signedAmount(figures.dayChange, currency)}
            {signedPercent(figures.dayChangePercentage)}
          </span>
        )}
      </span>
    </button>
  );
};

const buildSections = (dashboard: DashboardData) => {
  const instruments = new Map<string, ViewOption[]>();
  for (const item of dashboard.instrumentBreakdown) {
    const options = instruments.get(item.kind) ?? [];
    options.push({
      value: toViewValue(item.kind, item.code, item.stockMarket),
      label: `${item.name}${getExcludedPortfolioTag(item)}`,
      currency: item.displayCurrency,
      closed: item.openPositions === 0,
      figures: item,
    });
    instruments.set(item.kind, options);
  }
  return [
    {
      title: null,
      options: [
        {
          value: PORTFOLIO_VIEW,
          label: 'All investments',
          currency: INR,
          closed: false,
          figures: dashboard.summary,
        },
      ],
    },
    {
      title: 'Categories',
      options: dashboard.categoryBreakdown.map((item) => ({
        value: toCategoryViewValue(item.category),
        label: investmentCategoryLabels[item.category],
        currency: INR,
        closed: item.openPositions === 0,
        figures: item,
      })),
    },
    ...[...instruments.entries()].map(([kind, options]) => ({
      title: investmentKindLabels[kind as keyof typeof investmentKindLabels],
      options: options.toSorted((left, right) => Number(left.closed) - Number(right.closed)),
    })),
  ];
};

export const findViewLabel = (dashboard: DashboardData, value: string) =>
  buildSections(dashboard)
    .flatMap((section) => section.options)
    .find((option) => option.value === value)?.label ?? 'All investments';

export const TimelineViewList = ({
  dashboard,
  value,
  onSelect,
}: {
  dashboard: DashboardData;
  value: string;
  onSelect: (value: string) => void;
}) => (
  <nav aria-label="Timeline view" className="flex flex-col gap-3">
    {buildSections(dashboard).map((section) => (
      <section key={section.title ?? 'portfolio'} className="flex flex-col">
        {section.title === null ? null : (
          <h3 className="text-muted-foreground border-b px-2 pb-1.5 text-xs font-medium">
            {section.title}
          </h3>
        )}
        <div className="flex flex-col pt-1">
          {section.options.map((option) => (
            <ViewRow
              key={option.value}
              option={option}
              selected={option.value === value}
              onSelect={onSelect}
            />
          ))}
        </div>
      </section>
    ))}
  </nav>
);
