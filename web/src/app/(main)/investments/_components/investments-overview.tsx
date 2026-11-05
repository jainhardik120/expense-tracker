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

import { AssetAllocationCard } from './asset-allocation-card';
import { getExcludedPortfolioDescription, getExcludedPortfolioTag } from './display';
import { getSignedValueTone } from './investment-columns';

type DashboardData = RouterOutput['investments']['getInvestmentsInitialData']['dashboard'];

const POSITIVE_TONE = 'text-green-600';
const MUTUAL_FUNDS = 'mutual_funds';
const NEGATIVE_TONE = 'text-red-600';
const UNITS_DECIMALS = 4;
const USD_CURRENCY = 'USD';

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

const CURRENT_VALUE = 'Current value';

const AGGREGATE_LABELS = {
  value: CURRENT_VALUE,
  base: 'Invested',
  difference: 'Gain/loss',
  relative: 'Return on invested',
};

const INTRADAY_LABELS = {
  value: CURRENT_VALUE,
  base: 'Previous close',
  difference: '1D gain/loss',
  relative: '1D return',
};

const NAV_LABELS = {
  value: CURRENT_VALUE,
  base: 'Previous NAV value',
  difference: 'Last NAV change',
  relative: 'Last NAV return',
};

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$' };
const DAY_FORMAT = 'd MMM';
const DAY_KEY_FORMAT = 'yyyy-MM-dd';

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
  const isToday = zoned(asOf, DAY_KEY_FORMAT) === zoned(new Date(), DAY_KEY_FORMAT);
  const isOpen = isLive && isToday && isIndianMarketOpen(new Date());
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

const NumberRow = ({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: string;
  note?: string;
}) => (
  <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
    <span className="text-muted-foreground text-sm">{label}</span>
    <span className="text-right">
      <span className={cn('font-semibold tabular-nums', tone)}>{value}</span>
      {note === undefined ? null : (
        <span className="text-muted-foreground block text-xs">{note}</span>
      )}
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
  totalCharges,
  onCategoryToggle,
  onSelect,
}: {
  asOf: Date | null;
  isLive: boolean;
  dashboard: DashboardData;
  filters: TimelineFilters;
  selectedCategories: Set<InvestmentCategoryValue>;
  selection: { category: string[]; instrument: string[] };
  totalCharges: number;
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
    { refetchInterval: MS_PER_MINUTE },
  );
  const timelinePoints = useMemo(() => timelineQuery.data?.points ?? [], [timelineQuery.data]);
  const isIntraday = timelineQuery.data?.intraday ?? false;
  const pricePoints = useMemo(
    () => timelinePoints.map((point) => ({ date: point.date, price: point.unitPrice })),
    [timelinePoints],
  );
  const zoned = useZonedFormat();
  const { data: todayEstimate } = api.mutualFundAnalysis.getTodayEstimate.useQuery(undefined, {
    refetchInterval: MS_PER_MINUTE,
  });
  const fundsCategory = dashboard.categoryBreakdown.find((item) => item.category === MUTUAL_FUNDS);
  const fundsToday =
    todayEstimate === undefined
      ? undefined
      : estimateFundsToday(dashboard.instrumentBreakdown, todayEstimate.percents);
  const navDay = zoned(todayEstimate?.navDate ?? null, DAY_FORMAT);
  const oldestNavDay = zoned(todayEstimate?.oldestNavDate ?? null, DAY_FORMAT);
  const navSpan = oldestNavDay === navDay ? navDay : `${oldestNavDay} to ${navDay}`;
  const navLabel =
    todayEstimate?.navDate === null || todayEstimate === undefined ? 'last NAV' : `${navSpan} NAV`;
  const estimateDate = todayEstimate?.estimateDate ?? null;
  const estimateDay =
    zoned(estimateDate, DAY_KEY_FORMAT) === zoned(new Date(), DAY_KEY_FORMAT)
      ? 'today'
      : zoned(estimateDate, DAY_FORMAT);
  const selectedRow = dashboard.instrumentBreakdown.find(
    (item) =>
      item.kind === selectedInstrument?.kind &&
      item.code === selectedInstrument.code &&
      item.stockMarket === selectedInstrument.stockMarket,
  );
  const isClosedInstrument = selectedRow?.openPositions === 0;
  const excludedPositions =
    dashboard.categoryBreakdown.reduce((total, item) => total + item.openPositions, 0) -
    dashboard.summary.openPositions;
  const positionNotes = [
    ...(dashboard.summary.closedPositions === 0
      ? []
      : [`${String(dashboard.summary.closedPositions)} closed`]),
    ...(excludedPositions === 0 ? [] : [`${String(excludedPositions)} not in totals`]),
  ];
  const isMultiSelect =
    viewSelection === PORTFOLIO_VIEW &&
    (selection.category.length > 1 || selection.instrument.length > 1);
  const categories = dashboard.categoryBreakdown.map((item) => ({
    key: item.category,
    label: investmentCategoryLabels[item.category],
    value: item.valuationAmount,
    invested: item.investedAmount,
    dayChange: item.dayChange,
    xirr: item.xirr,
    openPositions: item.openPositions,
    closedPositions: item.closedPositions,
    selected: selectedCategories.has(item.category),
    onToggle: () => {
      onCategoryToggle(item.category);
    },
  }));
  const isNavView = selectedCategory === MUTUAL_FUNDS || selectedInstrument?.kind === MUTUAL_FUNDS;
  const intradayLabels = isNavView ? NAV_LABELS : INTRADAY_LABELS;
  const chartLabels = isToday ? intradayLabels : AGGREGATE_LABELS;
  const averageBuyPrice = selectedRow?.averageBuyPrice ?? null;
  const hasChart = timelinePoints.length >= 2;
  const selectedCurrency = selectedInstrument?.displayCurrency ?? 'INR';
  const chartCurrency = !isAggregateView && selectedCurrency === USD_CURRENCY ? 'USD' : 'INR';
  const chartSymbol = CURRENCY_SYMBOLS[chartCurrency];
  const intradayTitle = isNavView ? 'Last NAV change' : '1D gain or loss';

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card className="min-w-0">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Investment Timeline</CardTitle>
            <div className="flex w-full flex-wrap items-center gap-2">
              <Select value={viewSelection} onValueChange={setViewSelection}>
                <SelectTrigger className="w-full">
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
                          {option.name}
                          {getExcludedPortfolioTag(option)}
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
                {selectedCategorySummary.openPositions} open /{' '}
                {selectedCategorySummary.closedPositions} closed - Invested{' '}
                {formatCurrency(selectedCategorySummary.investedAmount)} - Value{' '}
                {formatCurrency(selectedCategorySummary.valuationAmount)} - P/L{' '}
                <span className={selectedCategorySummary.pnl >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
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
            {!isPortfolioView && selectedInstrument !== null && selectedInstrument !== undefined ? (
              <div className="text-muted-foreground text-sm">
                {isClosedInstrument ? (
                  <>
                    Closed - Proceeds{' '}
                    {formatCurrency(selectedInstrument.valuationAmount, selectedCurrency)} -
                    Realised{' '}
                    <span className={selectedInstrument.pnl >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
                      {formatCurrency(selectedInstrument.pnl, selectedCurrency)}
                    </span>
                  </>
                ) : (
                  <>
                    Units {formatNumber(selectedInstrument.units, UNITS_DECIMALS)} - Value{' '}
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
                  </>
                )}
                {getExcludedPortfolioDescription(selectedInstrument)}
              </div>
            ) : null}
            {isMultiSelect ? (
              <div className="text-muted-foreground text-sm">
                Chart shows all investments. Pick one category or instrument to chart it.
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
                        rupees: `${intradayTitle}, in ${chartSymbol}`,
                        percent: `${intradayTitle}, as % of previous close`,
                      }
                    : {
                        rupees: `Gain or loss, in ${chartSymbol}`,
                        percent: 'Gain or loss, as % of invested',
                      }
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
      <AssetAllocationCard allocation={dashboard.assetAllocation} categories={categories} />
      <Card className="md:col-span-2 xl:col-span-1">
        <CardHeader>
          <CardTitle>Your numbers</CardTitle>
          <LiveStatus asOf={asOf} isLive={isLive} />
        </CardHeader>
        <CardContent className="divide-y">
          <NumberRow
            label="Total invested"
            note={totalCharges > 0 ? `+ ${formatCurrency(totalCharges)} charges` : undefined}
            value={formatCurrency(dashboard.summary.investedAmount)}
          />
          <NumberRow
            label="Current value"
            value={formatCurrency(dashboard.summary.valuationAmount)}
          />
          <NumberRow
            label="Unrealised P/L"
            tone={getSignedValueTone(dashboard.summary.pnl)}
            value={formatCurrency(dashboard.summary.pnl)}
          />
          <NumberRow
            label="Realised P/L"
            tone={getSignedValueTone(dashboard.summary.realizedPnl)}
            value={formatCurrency(dashboard.summary.realizedPnl)}
          />
          {fundsCategory === undefined ? (
            <NumberRow
              label="1D change"
              tone={getSignedValueTone(dashboard.summary.dayChange)}
              value={formatCurrency(dashboard.summary.dayChange)}
            />
          ) : (
            <>
              <NumberRow
                label="1D, stocks and others"
                tone={getSignedValueTone(dashboard.summary.dayChange - fundsCategory.dayChange)}
                value={formatCurrency(dashboard.summary.dayChange - fundsCategory.dayChange)}
              />
              <NumberRow
                label={`1D, funds at ${navLabel}`}
                tone={getSignedValueTone(fundsCategory.dayChange)}
                value={formatCurrency(fundsCategory.dayChange)}
              />
              {fundsToday === null || fundsToday === undefined ? null : (
                <NumberRow
                  label={`Funds ${estimateDay}, est.`}
                  tone={getSignedValueTone(fundsToday)}
                  value={formatCurrency(fundsToday)}
                />
              )}
            </>
          )}
          <NumberRow
            label="XIRR"
            tone={
              dashboard.summary.xirr === null
                ? undefined
                : getSignedValueTone(dashboard.summary.xirr)
            }
            value={dashboard.summary.xirr === null ? '-' : formatPercent(dashboard.summary.xirr)}
          />
          <NumberRow
            label="Open positions"
            note={positionNotes.length === 0 ? undefined : positionNotes.join(' · ')}
            value={String(dashboard.summary.openPositions)}
          />
        </CardContent>
      </Card>
    </div>
  );
};
