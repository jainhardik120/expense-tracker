'use client';

import { useMemo, useState } from 'react';

import { startOfDay, subDays } from 'date-fns';

import {
  GainLossChart,
  type GainLossPoint,
  PriceChart,
  ValueVsBaseChart,
} from '@/components/gain-loss-chart';
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
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import {
  investmentCategoryLabels,
  investmentCategoryValues,
  type InvestmentCategoryValue,
  investmentKindLabels,
  investmentKindValues,
  type InvestmentKindValue,
  type InvestmentTimelineRangeValue,
  investmentTimelineRangeDays,
  normalizeStockMarket,
  type StockMarketValue,
  mergeTimelines,
  type TimelineFilters,
} from '@/lib/investments';
import {
  PORTFOLIO_VIEW,
  parseCategoryViewValue,
  parseViewValue,
  toCategoryViewValue,
  toViewValue,
} from '@/lib/investment-selection';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { getExcludedPortfolioDescription, getExcludedPortfolioTag } from './display';
import { getSignedValueTone } from './investment-columns';

type DashboardData = RouterOutput['investments']['getInvestmentsInitialData']['dashboard'];
type CategoryTimelineEntry =
  RouterOutput['investments']['getInvestmentsInitialData']['categoryTimelines'][number];
type InstrumentTimelineEntry =
  RouterOutput['investments']['getInvestmentsInitialData']['instrumentTimelines'][number];

const POSITIVE_TONE = 'text-green-600';
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

const AGGREGATE_LABELS = {
  value: 'Current value',
  base: 'Invested',
  difference: 'Gain/loss',
  relative: 'Return on invested',
};

const currentTotalsFor = ({
  isPortfolioView,
  summary,
  category,
  instrument,
}: {
  isPortfolioView: boolean;
  summary: DashboardData['summary'];
  category: DashboardData['categoryBreakdown'][number] | undefined;
  instrument: DashboardData['instrumentOptions'][number] | null;
}) => {
  if (isPortfolioView) {
    return { value: summary.valuationAmount, invested: summary.investedAmount };
  }
  if (category !== undefined) {
    return { value: category.valuationAmount, invested: category.investedAmount };
  }
  return instrument === null
    ? null
    : { value: instrument.valuationAmount, invested: instrument.investedAmount };
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
  const [onlyInstrument] = instrument;
  if (instrument.length === 1 && onlyInstrument !== undefined) {
    return onlyInstrument;
  }
  const [onlyCategory] = category;
  if (category.length === 1 && onlyCategory !== undefined) {
    const parsed = parseCategoryViewValue(
      toCategoryViewValue(onlyCategory as InvestmentCategoryValue),
    );
    return parsed === null ? PORTFOLIO_VIEW : toCategoryViewValue(parsed);
  }
  return PORTFOLIO_VIEW;
};

export const InvestmentsOverview = ({
  categoryTimelines,
  dashboard,
  instrumentTimelines,
  filters,
  selectedCategories,
  selection,
  onCategoryToggle,
  onSelect,
}: {
  categoryTimelines: CategoryTimelineEntry[];
  dashboard: DashboardData;
  instrumentTimelines: InstrumentTimelineEntry[];
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

  const selectedCategory = parseCategoryViewValue(viewSelection);
  const selectedCategorySummary = dashboard.categoryBreakdown.find(
    (item) => item.category === selectedCategory,
  );

  const isPortfolioView = viewSelection === PORTFOLIO_VIEW;
  const isCategoryView = selectedCategory !== null;
  const isAggregateView = isPortfolioView || isCategoryView;
  const activeChart: ChartTab = chartTab === 'price' && isAggregateView ? 'gain' : chartTab;
  const requiresRemoteTimeline =
    timeRange === '3m' || timeRange === '6m' || timeRange === 'lifetime';

  const rangeTimelineInput = {
    start: filters.start,
    end: filters.end,
    investmentKind: filters.investmentKind,
    range: timeRange,
  };
  const fixedDepositTimelineQuery = api.investments.getInvestmentsTimelinesByType.useQuery(
    { ...rangeTimelineInput, investmentType: 'fd' },
    { enabled: requiresRemoteTimeline },
  );
  const stocksTimelineQuery = api.investments.getInvestmentsTimelinesByType.useQuery(
    { ...rangeTimelineInput, investmentType: 'stocks' },
    { enabled: requiresRemoteTimeline },
  );
  const mutualFundsTimelineQuery = api.investments.getInvestmentsTimelinesByType.useQuery(
    { ...rangeTimelineInput, investmentType: 'mutual_funds' },
    { enabled: requiresRemoteTimeline },
  );
  const cryptoTimelineQuery = api.investments.getInvestmentsTimelinesByType.useQuery(
    { ...rangeTimelineInput, investmentType: 'crypto' },
    { enabled: requiresRemoteTimeline },
  );
  const commoditiesTimelineQuery = api.investments.getInvestmentsTimelinesByType.useQuery(
    { ...rangeTimelineInput, investmentType: 'commodities' },
    { enabled: requiresRemoteTimeline },
  );
  const epfoTimelineQuery = api.investments.getInvestmentsTimelinesByType.useQuery(
    { ...rangeTimelineInput, investmentType: 'epfo' },
    { enabled: requiresRemoteTimeline },
  );
  const otherTimelineQuery = api.investments.getInvestmentsTimelinesByType.useQuery(
    { ...rangeTimelineInput, investmentType: 'other' },
    { enabled: requiresRemoteTimeline },
  );
  const timelineQueries = [
    fixedDepositTimelineQuery,
    stocksTimelineQuery,
    mutualFundsTimelineQuery,
    cryptoTimelineQuery,
    commoditiesTimelineQuery,
    epfoTimelineQuery,
    otherTimelineQuery,
  ];
  const remoteTimelineData = timelineQueries.flatMap((query) =>
    query.data === undefined ? [] : [query.data],
  );
  const remotePortfolioTimeline = mergeTimelines(
    remoteTimelineData.flatMap((data) => data.timeline),
  ).sort((left, right) => left.date.getTime() - right.date.getTime());

  let selectedTimelineEntries = instrumentTimelines;
  let selectedCategoryTimelineEntries = categoryTimelines;
  let portfolioTimeline = dashboard.timeline;
  if (requiresRemoteTimeline) {
    selectedTimelineEntries = remoteTimelineData.flatMap((data) => data.instrumentTimelines);
    selectedCategoryTimelineEntries = remoteTimelineData.flatMap((data) => data.categoryTimelines);
    if (remotePortfolioTimeline.length > 0) {
      portfolioTimeline = remotePortfolioTimeline;
    }
  }

  const instrumentTimelineMap = useMemo(() => {
    const map = new Map<string, InstrumentTimelineEntry['timeline']>();
    for (const entry of selectedTimelineEntries) {
      map.set(toViewValue(entry.kind, entry.code, entry.stockMarket), entry.timeline);
    }
    return map;
  }, [selectedTimelineEntries]);

  const categoryTimelineMap = useMemo(() => {
    return new Map(
      selectedCategoryTimelineEntries.map((entry) => [entry.category, entry.timeline]),
    );
  }, [selectedCategoryTimelineEntries]);

  const filteredPoints = useMemo(() => {
    let aggregateTimeline: DashboardData['timeline'] | null = null;
    if (isPortfolioView) {
      aggregateTimeline = portfolioTimeline;
    } else if (selectedCategory !== null) {
      aggregateTimeline = categoryTimelineMap.get(selectedCategory) ?? [];
    }
    const days = investmentTimelineRangeDays[timeRange];
    const cutoffDate =
      requiresRemoteTimeline || days === undefined
        ? null
        : subDays(startOfDay(new Date()), days - 1).getTime();
    const inRange = (date: Date) => cutoffDate === null || startOfDay(date).getTime() >= cutoffDate;
    return {
      aggregate:
        aggregateTimeline === null
          ? null
          : aggregateTimeline.filter((point) => inRange(point.date)),
      instrument: (instrumentTimelineMap.get(viewSelection)?.points ?? []).filter((point) =>
        inRange(point.date),
      ),
    };
  }, [
    instrumentTimelineMap,
    categoryTimelineMap,
    isPortfolioView,
    portfolioTimeline,
    requiresRemoteTimeline,
    selectedCategory,
    timeRange,
    viewSelection,
  ]);

  const currentTotals = useMemo(
    () =>
      currentTotalsFor({
        isPortfolioView,
        summary: dashboard.summary,
        category: selectedCategorySummary,
        instrument: selectedInstrument ?? null,
      }),
    [isPortfolioView, dashboard.summary, selectedCategorySummary, selectedInstrument],
  );

  const gainLossPoints = useMemo((): GainLossPoint[] => {
    const points =
      filteredPoints.aggregate === null
        ? filteredPoints.instrument.map((point) => ({
            date: point.date,
            value: point.holdingValue,
            base: point.investedAmount,
          }))
        : filteredPoints.aggregate.map((point) => ({
            date: point.date,
            value: point.valuationAmount,
            base: point.investedAmount,
          }));
    if (currentTotals === null) {
      return points;
    }
    const today = startOfDay(new Date()).getTime();
    const current = {
      date: new Date(today),
      value: currentTotals.value,
      base: currentTotals.invested,
    };
    const last = points.at(-1);
    return last !== undefined && startOfDay(last.date).getTime() >= today
      ? [...points.slice(0, -1), current]
      : [...points, current];
  }, [filteredPoints.aggregate, filteredPoints.instrument, currentTotals]);

  const isLoadingTimeline =
    requiresRemoteTimeline &&
    timelineQueries.some((query) => query.isFetching) &&
    gainLossPoints.length < 2;
  const selectedCurrency = selectedInstrument?.displayCurrency ?? 'INR';
  const chartCurrency = !isAggregateView && selectedCurrency === USD_CURRENCY ? 'USD' : 'INR';

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Invested</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatCurrency(dashboard.summary.investedAmount)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Value</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatCurrency(dashboard.summary.valuationAmount)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total P/L</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-xl font-semibold ${dashboard.summary.pnl >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}`}
          >
            {formatCurrency(dashboard.summary.pnl)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">1D Change</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-xl font-semibold ${dashboard.summary.dayChange >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}`}
          >
            {formatCurrency(dashboard.summary.dayChange)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">XIRR</CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              'text-xl font-semibold',
              dashboard.summary.xirr !== null && getSignedValueTone(dashboard.summary.xirr),
            )}
          >
            {dashboard.summary.xirr === null ? '-' : formatPercent(dashboard.summary.xirr)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {dashboard.summary.openPositions}
          </CardContent>
        </Card>
        <div className="text-muted-foreground px-1 text-xs sm:col-span-2">
          Portfolio totals exclude RSU positions and EPFO.
        </div>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Investment Timeline</CardTitle>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Select
                value={timeRange}
                onValueChange={(value) => {
                  setTimeRange(value as InvestmentTimelineRangeValue);
                }}
              >
                <SelectTrigger className="w-[7rem]">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          {isCategoryView && selectedCategorySummary !== undefined ? (
            <div className="text-muted-foreground text-sm">
              {investmentCategoryLabels[selectedCategorySummary.category]} -{' '}
              {selectedCategorySummary.openPositions} open /{' '}
              {selectedCategorySummary.closedPositions} closed - Invested{' '}
              {formatCurrency(selectedCategorySummary.investedAmount)} - Value{' '}
              {formatCurrency(selectedCategorySummary.valuationAmount)} - P/L{' '}
              <span className={selectedCategorySummary.pnl >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
                {formatCurrency(selectedCategorySummary.pnl)}
              </span>
            </div>
          ) : null}
          {!isPortfolioView && selectedInstrument !== null && selectedInstrument !== undefined ? (
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
              <span className={selectedInstrument.dayChange >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
                {formatCurrency(selectedInstrument.dayChange, selectedCurrency)}
              </span>
              {getExcludedPortfolioDescription(selectedInstrument)}
            </div>
          ) : null}
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
          {gainLossPoints.length < 2 ? (
            <p className="text-muted-foreground text-sm">
              {isLoadingTimeline
                ? 'Loading timeline...'
                : 'No timeline data available for the selected view.'}
            </p>
          ) : null}
          {activeChart === 'gain' ? (
            <GainLossChart
              currency={chartCurrency}
              labels={AGGREGATE_LABELS}
              points={gainLossPoints}
              title={{ rupees: 'Gain or loss, in ₹', percent: 'Gain or loss, as % of invested' }}
            />
          ) : null}
          {activeChart === 'value' ? (
            <ValueVsBaseChart
              currency={chartCurrency}
              labels={AGGREGATE_LABELS}
              points={gainLossPoints}
            />
          ) : null}
          {activeChart === 'price' ? (
            <PriceChart
              currency={chartCurrency}
              points={filteredPoints.instrument.map((point) => ({
                date: point.date,
                price: point.unitPrice,
              }))}
            />
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.categoryBreakdown.map((categoryItem) => {
              const isSelected = selectedCategories.has(categoryItem.category);
              return (
                <button
                  key={categoryItem.category}
                  aria-pressed={isSelected}
                  className={cn(
                    'bg-muted/40 hover:bg-muted/70 focus-visible:ring-ring rounded-md border p-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    isSelected && 'border-primary bg-primary/10 hover:bg-primary/15',
                  )}
                  type="button"
                  onClick={() => {
                    onCategoryToggle(categoryItem.category);
                  }}
                >
                  <div className="font-semibold">
                    {investmentCategoryLabels[categoryItem.category]}
                  </div>
                  <div className="text-muted-foreground">
                    {categoryItem.openPositions} open / {categoryItem.closedPositions} closed
                  </div>
                  <div>Invested {formatCurrency(categoryItem.investedAmount)}</div>
                  <div>Current Value {formatCurrency(categoryItem.valuationAmount)}</div>
                  <div className={categoryItem.pnl >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
                    PNL {formatCurrency(categoryItem.pnl)}
                  </div>
                  <div className={categoryItem.dayChange >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
                    1D {formatCurrency(categoryItem.dayChange)}
                  </div>
                  {categoryItem.xirr === null ? null : (
                    <div className={getSignedValueTone(categoryItem.xirr)}>
                      XIRR {formatPercent(categoryItem.xirr)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            Crypto market data provided by{' '}
            <a
              className="underline underline-offset-2"
              href="https://www.coingecko.com/"
              rel="noreferrer"
              target="_blank"
            >
              CoinGecko
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
