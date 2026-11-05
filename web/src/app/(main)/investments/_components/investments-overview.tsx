'use client';

import { useMemo, useState } from 'react';

import { GainLossChart, PriceChart, ValueVsBaseChart } from '@/components/gain-loss-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { estimateFundsToday } from '@/lib/fund-estimate';
import {
  PORTFOLIO_VIEW,
  parseCategoryViewValue,
  parseViewValue,
  toCategoryViewValue,
  toViewValue,
} from '@/lib/investment-selection';
import {
  investmentCategoryLabels,
  type InvestmentCategoryValue,
  investmentKindLabels,
  type InvestmentKindValue,
  type InvestmentTimelineRangeValue,
  type TimelineFilters,
} from '@/lib/investments';
import { cn } from '@/lib/utils';
import { isIndianMarketOpen } from '@/server/helpers/investment/market-hours';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { MS_PER_MINUTE } from '@/types';

import { getExcludedPortfolioDescription, getExcludedPortfolioTag } from './display';
import { getSignedValueTone } from './investment-columns';

type DashboardData = RouterOutput['investments']['getInvestmentsInitialData']['dashboard'];

const POSITIVE_TONE = 'text-green-600';
const MUTUAL_FUNDS = 'mutual_funds';
const NEGATIVE_TONE = 'text-red-600';
const UNITS_DECIMALS = 4;
const USD_CURRENCY = 'USD';
const LIVE_RANGES = new Set<InvestmentTimelineRangeValue>(['1d', '1w', '1m']);

type ChartTab = 'gain' | 'value' | 'price';

const AGGREGATE_CHARTS: Array<{ key: ChartTab; label: string }> = [
  { key: 'gain', label: 'Gain/loss' },
  { key: 'value', label: 'Value vs invested' },
];

const INSTRUMENT_CHARTS: Array<{ key: ChartTab; label: string }> = [
  { key: 'gain', label: 'Gain/loss' },
  { key: 'value', label: 'Value vs invested' },
  { key: 'price', label: 'Unit price' },
];

const AGGREGATE_LABELS = {
  value: 'Current value',
  base: 'Invested',
  difference: 'Gain/loss',
  relative: 'Return on invested',
};

const INTRADAY_LABELS = {
  value: 'Current value',
  base: 'Previous close',
  difference: "Today's gain/loss",
  relative: "Today's return",
};

const TIME_RANGE_OPTIONS: Array<{ value: InvestmentTimelineRangeValue; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: 'lifetime', label: 'Lifetime' },
];

const viewFromSelection = ({
  category,
  instrument,
}: {
  category: string[];
  instrument: string[];
}) => {
  if (instrument.length === 1) {
    return instrument[0];
  }
  if (category.length === 1) {
    const parsed = parseCategoryViewValue(
      toCategoryViewValue(category[0] as InvestmentCategoryValue),
    );
    return parsed === null ? PORTFOLIO_VIEW : toCategoryViewValue(parsed);
  }
  return PORTFOLIO_VIEW;
};

const LiveStatus = ({ asOf, isLive }: { asOf: Date | null; isLive: boolean }) => {
  const zoned = useZonedFormat();
  const isOpen = isLive && isIndianMarketOpen(new Date());
  const isToday = zoned(asOf, 'yyyy-MM-dd') === zoned(new Date(), 'yyyy-MM-dd');
  const closedLabel = isLive ? 'Market closed' : 'Last saved';
  return (
    <div className="text-muted-foreground mt-1 flex min-h-4 items-center gap-1.5 text-xs font-normal">
      {asOf === null ? null : (
        <>
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              isOpen ? 'animate-pulse bg-green-600' : 'bg-muted-foreground',
            )}
          />
          {isOpen ? 'Live' : closedLabel} · as of{' '}
          {zoned(asOf, isToday ? 'h:mm a' : 'd MMM, h:mm a')}
        </>
      )}
    </div>
  );
};

const StatCard = ({
  title,
  tone,
  className,
  children,
}: {
  title: string;
  tone?: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <Card className={cn('gap-2 py-3 sm:gap-6 sm:py-6', className)}>
    <CardHeader className="px-3 sm:px-6 sm:pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
    </CardHeader>
    <CardContent className={cn('px-3 text-lg font-semibold sm:px-6 sm:text-xl', tone)}>
      {children}
    </CardContent>
  </Card>
);

const CategoryFigure = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn('text-right tabular-nums', tone)}>{value}</span>
  </div>
);

const DayFigure = ({ label, value }: { label: string; value: number | null | undefined }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
    <span className="text-muted-foreground whitespace-nowrap">{label}</span>
    <span className={cn('ml-auto tabular-nums', getSignedValueTone(value ?? null))}>
      {value === null || value === undefined ? '-' : formatCurrency(value)}
    </span>
  </div>
);

const ChartPlaceholder = ({ isLoading }: { isLoading: boolean }) =>
  isLoading ? (
    <Skeleton className="size-full" />
  ) : (
    <div className="text-muted-foreground flex size-full items-center justify-center rounded-md border border-dashed text-sm">
      No timeline data available for the selected view.
    </div>
  );

export const InvestmentsOverview = ({
  asOf,
  isLive,
  dashboard,
  filters,
  selectedCategories,
  selection,
  onCategoryToggle,
  onSelect,
}: {
  asOf: Date | null;
  isLive: boolean;
  dashboard: DashboardData;
  filters: TimelineFilters;
  selectedCategories: Set<InvestmentCategoryValue>;
  selection: { category: string[]; instrument: string[] };
  onCategoryToggle: (category: InvestmentCategoryValue) => void;
  onSelect: (next: { category?: string[]; instrument?: string[] }) => void;
}) => {
  const viewSelection = viewFromSelection(selection);
  const setViewSelection = (value: string) => {
    const category = parseCategoryViewValue(value);
    if (category !== null) {
      onSelect({ category: [category], instrument: [] });
    } else if (parseViewValue(value) === null) {
      onSelect({ category: [], instrument: [] });
    } else {
      onSelect({ category: [], instrument: [value] });
    }
  };
  const [timeRange, setTimeRange] = useState<InvestmentTimelineRangeValue>('1m');
  const [chartTab, setChartTab] = useState<ChartTab>('gain');

  const groupedOptions = useMemo(() => {
    const map = new Map<InvestmentKindValue, DashboardData['instrumentOptions']>();
    for (const option of dashboard.instrumentOptions) {
      const existing = map.get(option.kind) ?? [];
      existing.push(option);
      map.set(option.kind, existing);
    }
    return map;
  }, [dashboard.instrumentOptions]);

  const selectedInstrument = useMemo(() => {
    const parsed = parseViewValue(viewSelection);
    if (parsed === null) {
      return null;
    }
    return dashboard.instrumentOptions.find((option) => {
      return (
        option.kind === parsed.kind &&
        option.code === parsed.code &&
        option.stockMarket === parsed.stockMarket
      );
    });
  }, [dashboard.instrumentOptions, viewSelection]);

  const averageBuyPrice =
    dashboard.instrumentBreakdown.find(
      (item) =>
        item.kind === selectedInstrument?.kind &&
        item.code === selectedInstrument.code &&
        item.stockMarket === selectedInstrument.stockMarket,
    )?.averageBuyPrice ?? null;

  const selectedCategory = parseCategoryViewValue(viewSelection);
  const selectedCategorySummary = dashboard.categoryBreakdown.find(
    (item) => item.category === selectedCategory,
  );

  const isPortfolioView = viewSelection === PORTFOLIO_VIEW;
  const isCategoryView = selectedCategory !== null;
  const isAggregateView = isPortfolioView || isCategoryView;
  const activeChart: ChartTab = chartTab === 'price' && isAggregateView ? 'gain' : chartTab;
  const isToday = timeRange === '1d';
  const timelineQuery = api.investments.getFineTimeline.useQuery(
    {
      start: filters.start,
      end: filters.end,
      investmentKind: filters.investmentKind,
      view: viewSelection,
      range: timeRange,
    },
    { refetchInterval: LIVE_RANGES.has(timeRange) ? MS_PER_MINUTE : false },
  );
  const timelinePoints = useMemo(() => timelineQuery.data?.points ?? [], [timelineQuery.data]);
  const isIntraday = timelineQuery.data?.intraday ?? false;
  const pricePoints = useMemo(
    () => timelinePoints.map((point) => ({ date: point.date, price: point.unitPrice })),
    [timelinePoints],
  );
  const zoned = useZonedFormat();
  const { data: todayEstimate } = api.mutualFundAnalysis.getTodayEstimate.useQuery(undefined, {
    refetchInterval: (current) => (current.state.data?.marketOpen === true ? MS_PER_MINUTE : false),
  });
  const fundsCategory = dashboard.categoryBreakdown.find((item) => item.category === MUTUAL_FUNDS);
  const fundsToday =
    todayEstimate === undefined
      ? undefined
      : estimateFundsToday(dashboard.instrumentBreakdown, todayEstimate.percents);
  const navLabel =
    todayEstimate?.navDate === null || todayEstimate === undefined
      ? 'last NAV'
      : `${zoned(todayEstimate.navDate, 'd MMM')} NAV`;
  const chartLabels = isToday ? INTRADAY_LABELS : AGGREGATE_LABELS;
  const hasChart = timelinePoints.length >= 2;
  const selectedCurrency = selectedInstrument?.displayCurrency ?? 'INR';
  const chartCurrency = !isAggregateView && selectedCurrency === USD_CURRENCY ? 'USD' : 'INR';

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="grid grid-cols-2 gap-3 xl:grid-rows-4">
        <StatCard title="Total Invested">
          {formatCurrency(dashboard.summary.investedAmount)}
        </StatCard>
        <StatCard title="Current Value">
          {formatCurrency(dashboard.summary.valuationAmount)}
          <LiveStatus asOf={asOf} isLive={isLive} />
        </StatCard>
        <StatCard title="Unrealised P/L" tone={getSignedValueTone(dashboard.summary.pnl)}>
          {formatCurrency(dashboard.summary.pnl)}
          <LiveStatus asOf={asOf} isLive={isLive} />
        </StatCard>
        <StatCard title="Realised P/L" tone={getSignedValueTone(dashboard.summary.realizedPnl)}>
          {formatCurrency(dashboard.summary.realizedPnl)}
        </StatCard>
        <StatCard title="1D Change">
          {fundsCategory === undefined ? (
            <span className={getSignedValueTone(dashboard.summary.dayChange)}>
              {formatCurrency(dashboard.summary.dayChange)}
            </span>
          ) : (
            <div className="grid gap-1 text-xs font-medium sm:text-sm">
              <DayFigure
                label="Stocks and others"
                value={dashboard.summary.dayChange - fundsCategory.dayChange}
              />
              <DayFigure label={`Funds, ${navLabel}`} value={fundsCategory.dayChange} />
              {fundsToday === null ? null : (
                <DayFigure label="Funds today, est." value={fundsToday} />
              )}
            </div>
          )}
          <LiveStatus asOf={asOf} isLive={isLive} />
        </StatCard>
        <StatCard
          title="XIRR"
          tone={
            dashboard.summary.xirr === null ? undefined : getSignedValueTone(dashboard.summary.xirr)
          }
        >
          {dashboard.summary.xirr === null ? '-' : formatPercent(dashboard.summary.xirr)}
        </StatCard>
        <StatCard className="col-span-2" title="Open Positions">
          {dashboard.summary.openPositions}
          {dashboard.summary.closedPositions === 0 ? null : (
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              · {dashboard.summary.closedPositions} closed
            </span>
          )}
        </StatCard>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Investment Timeline</CardTitle>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Select value={viewSelection} onValueChange={setViewSelection}>
                  <SelectTrigger className="w-full sm:w-[22rem]">
                    <SelectValue placeholder="Select portfolio or instrument" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Portfolio</SelectLabel>
                      <SelectItem value={PORTFOLIO_VIEW}>All Investments</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Categories</SelectLabel>
                      {dashboard.categoryBreakdown.map((item) => (
                        <SelectItem
                          key={toCategoryViewValue(item.category)}
                          value={toCategoryViewValue(item.category)}
                        >
                          {investmentCategoryLabels[item.category]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {[...groupedOptions.entries()].map(([kind, options]) => (
                      <SelectGroup key={kind}>
                        <SelectLabel>{investmentKindLabels[kind]}</SelectLabel>
                        {options.map((option) => (
                          <SelectItem
                            key={toViewValue(option.kind, option.code, option.stockMarket)}
                            value={toViewValue(option.kind, option.code, option.stockMarket)}
                          >
                            {option.name} ({option.code}
                            {option.kind === 'stocks' && option.stockMarket !== null
                              ? ` - ${option.stockMarket}`
                              : ''}
                            ){getExcludedPortfolioTag(option)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="xl:min-h-10">
              {isCategoryView && selectedCategorySummary !== undefined ? (
                <div className="text-muted-foreground text-sm">
                  {investmentCategoryLabels[selectedCategorySummary.category]} -{' '}
                  {selectedCategorySummary.openPositions} open /{' '}
                  {selectedCategorySummary.closedPositions} closed - Invested{' '}
                  {formatCurrency(selectedCategorySummary.investedAmount)} - Value{' '}
                  {formatCurrency(selectedCategorySummary.valuationAmount)} - P/L{' '}
                  <span
                    className={selectedCategorySummary.pnl >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}
                  >
                    {formatCurrency(selectedCategorySummary.pnl)}
                  </span>
                  {selectedCategorySummary.realizedPnl === 0 ? null : (
                    <>
                      {' '}
                      - Realised{' '}
                      <span className={getSignedValueTone(selectedCategorySummary.realizedPnl)}>
                        {formatCurrency(selectedCategorySummary.realizedPnl)}
                      </span>
                    </>
                  )}
                </div>
              ) : null}
              {!isPortfolioView &&
              selectedInstrument !== null &&
              selectedInstrument !== undefined ? (
                <div className="text-muted-foreground text-sm">
                  {selectedInstrument.name} ({selectedInstrument.code}
                  {selectedInstrument.kind === 'stocks' && selectedInstrument.stockMarket !== null
                    ? ` - ${selectedInstrument.stockMarket}`
                    : ''}
                  ) - Units {formatNumber(selectedInstrument.units, UNITS_DECIMALS)} - Value{' '}
                  {formatCurrency(selectedInstrument.valuationAmount, selectedCurrency)} - P/L{' '}
                  <span className={selectedInstrument.pnl >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
                    {formatCurrency(selectedInstrument.pnl, selectedCurrency)}
                  </span>{' '}
                  - 1D{' '}
                  <span
                    className={selectedInstrument.dayChange >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}
                  >
                    {formatCurrency(selectedInstrument.dayChange, selectedCurrency)}
                  </span>
                  {getExcludedPortfolioDescription(selectedInstrument)}
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex [scrollbar-width:none] gap-1 overflow-x-auto">
              {(isAggregateView ? AGGREGATE_CHARTS : INSTRUMENT_CHARTS).map((item) => (
                <Button
                  key={item.key}
                  className="shrink-0"
                  size="sm"
                  variant={item.key === activeChart ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setChartTab(item.key);
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <div className="h-64">
              {hasChart ? null : <ChartPlaceholder isLoading={timelineQuery.isPending} />}
              {hasChart && activeChart === 'gain' ? (
                <GainLossChart
                  currency={chartCurrency}
                  intraday={isIntraday}
                  labels={chartLabels}
                  points={timelinePoints}
                  title={
                    isToday
                      ? {
                          rupees: "Today's gain or loss, in ₹",
                          percent: "Today's gain or loss, as % of previous close",
                        }
                      : { rupees: 'Gain or loss, in ₹', percent: 'Gain or loss, as % of invested' }
                  }
                />
              ) : null}
              {hasChart && activeChart === 'value' ? (
                <ValueVsBaseChart
                  currency={chartCurrency}
                  intraday={isIntraday}
                  labels={chartLabels}
                  points={timelinePoints}
                />
              ) : null}
              {hasChart && activeChart === 'price' ? (
                <PriceChart
                  averageBuyPrice={averageBuyPrice}
                  currency={chartCurrency}
                  intraday={isIntraday}
                  points={pricePoints}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
              {TIME_RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  aria-pressed={option.value === timeRange}
                  className="h-7 rounded-full px-2.5 text-xs sm:px-3"
                  size="sm"
                  variant={option.value === timeRange ? 'default' : 'outline'}
                  onClick={() => {
                    setTimeRange(option.value);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dashboard.categoryBreakdown.map((categoryItem) => {
            const isSelected = selectedCategories.has(categoryItem.category);
            return (
              <button
                key={categoryItem.category}
                aria-pressed={isSelected}
                className={cn(
                  'bg-muted/40 hover:bg-muted/70 focus-visible:ring-ring flex flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none xl:max-[1400px]:text-xs',
                  isSelected && 'border-primary bg-primary/10 hover:bg-primary/15',
                )}
                type="button"
                onClick={() => {
                  onCategoryToggle(categoryItem.category);
                }}
              >
                <div className="flex flex-col whitespace-nowrap">
                  <span className="font-semibold">
                    {investmentCategoryLabels[categoryItem.category]}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {categoryItem.openPositions} open / {categoryItem.closedPositions} closed
                  </span>
                </div>
                <CategoryFigure
                  label="Invested"
                  value={formatCurrency(categoryItem.investedAmount)}
                />
                <CategoryFigure
                  label="Current Value"
                  value={formatCurrency(categoryItem.valuationAmount)}
                />
                <CategoryFigure
                  label="PNL"
                  tone={categoryItem.pnl >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}
                  value={formatCurrency(categoryItem.pnl)}
                />
                {categoryItem.realizedPnl === 0 ? null : (
                  <CategoryFigure
                    label="Realised"
                    tone={getSignedValueTone(categoryItem.realizedPnl)}
                    value={formatCurrency(categoryItem.realizedPnl)}
                  />
                )}
                <CategoryFigure
                  label={categoryItem.category === MUTUAL_FUNDS ? `1D, ${navLabel}` : '1D'}
                  tone={categoryItem.dayChange >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}
                  value={formatCurrency(categoryItem.dayChange)}
                />
                {categoryItem.category === MUTUAL_FUNDS && fundsToday !== null ? (
                  <DayFigure label="Today, est." value={fundsToday} />
                ) : null}
                {categoryItem.xirr === null ? null : (
                  <CategoryFigure
                    label="XIRR"
                    tone={getSignedValueTone(categoryItem.xirr)}
                    value={formatPercent(categoryItem.xirr)}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
