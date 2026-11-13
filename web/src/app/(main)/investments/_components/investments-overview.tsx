'use client';

import { useMemo, useState } from 'react';

import FullScreenDialog, { ExpandButton } from '@/components/full-screen-dialog';
import {
  GainLossChart,
  PeriodChangeChart,
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
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber } from '@/lib/format';
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
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { MS_PER_MINUTE } from '@/types';

import { AssetAllocationCard } from './asset-allocation-card';
import { getExcludedPortfolioDescription, getExcludedPortfolioTag } from './display';
import { getSignedValueTone } from './investment-columns';
import { TimelineViewList, findViewLabel } from './timeline-view-list';
import { YourNumbersCard } from './your-numbers-card';

type DashboardData = RouterOutput['investments']['getInvestmentsInitialData']['dashboard'];

const POSITIVE_TONE = 'text-green-600';
const MUTUAL_FUNDS = 'mutual_funds';
const NEGATIVE_TONE = 'text-red-600';
const UNITS_DECIMALS = 4;
const USD_CURRENCY = 'USD';

type ChartTab = 'gain' | 'daily' | 'value' | 'price';

const AGGREGATE_CHARTS: Array<{ key: ChartTab; label: string }> = [
  { key: 'gain', label: 'Gain/loss' },
  { key: 'daily', label: 'Daily change' },
  { key: 'value', label: 'Value vs invested' },
];

const INSTRUMENT_CHARTS: Array<{ key: ChartTab; label: string }> = [
  { key: 'gain', label: 'Gain/loss' },
  { key: 'daily', label: 'Daily change' },
  { key: 'value', label: 'Value vs invested' },
  { key: 'price', label: 'Unit price' },
];

const CURRENT_VALUE = 'Current value';
const MULTI_SELECT_NOTE =
  'Chart shows all investments. Pick one category or instrument to chart it.';

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

const TIME_RANGE_OPTIONS: Array<{ value: InvestmentTimelineRangeValue; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '1m', label: '1M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
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
  const [expanded, setExpanded] = useState(false);

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
        option.stockMarket === parsed.stockMarket &&
        option.isRsu === parsed.isRsu
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
  const firstBought = timelineQuery.data?.firstBought ?? null;
  const heldPoints = useMemo(
    () =>
      firstBought === null
        ? timelinePoints
        : timelinePoints.filter((point) => point.date.getTime() >= firstBought.getTime()),
    [timelinePoints, firstBought],
  );
  const isIntraday = timelineQuery.data?.intraday ?? false;
  const pricePoints = useMemo(
    () => timelinePoints.map((point) => ({ date: point.date, price: point.unitPrice })),
    [timelinePoints],
  );
  const selectedRow = dashboard.instrumentBreakdown.find(
    (item) =>
      item.kind === selectedInstrument?.kind &&
      item.code === selectedInstrument.code &&
      item.stockMarket === selectedInstrument.stockMarket,
  );
  const isClosedInstrument = selectedRow?.openPositions === 0;
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
  const hasChart = (activeChart === 'price' ? timelinePoints : heldPoints).length >= 2;
  const selectedCurrency = selectedInstrument?.displayCurrency ?? 'INR';
  const chartCurrency = !isAggregateView && selectedCurrency === USD_CURRENCY ? 'USD' : 'INR';
  const chartSymbol = CURRENCY_SYMBOLS[chartCurrency];
  const intradayTitle = isNavView ? 'Last NAV change' : '1D gain or loss';

  const viewPicker = (
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
                key={toViewValue(option.kind, option.code, option.stockMarket, option.isRsu)}
                value={toViewValue(option.kind, option.code, option.stockMarket, option.isRsu)}
              >
                {option.name}
                {getExcludedPortfolioTag(option)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
  const viewSummary = (
    <>
      {isCategoryView && selectedCategorySummary !== undefined ? (
        <div className="text-muted-foreground text-sm">
          {selectedCategorySummary.openPositions} open / {selectedCategorySummary.closedPositions}{' '}
          closed - Invested {formatCurrency(selectedCategorySummary.investedAmount)} - Value{' '}
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
              {formatCurrency(selectedInstrument.valuationAmount, selectedCurrency)} - Realised{' '}
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
              <span className={selectedInstrument.dayChange >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
                {formatCurrency(selectedInstrument.dayChange, selectedCurrency)}
              </span>
            </>
          )}
          {getExcludedPortfolioDescription(selectedInstrument)}
        </div>
      ) : null}
      {isMultiSelect ? (
        <div className="text-muted-foreground text-sm">{MULTI_SELECT_NOTE}</div>
      ) : null}
    </>
  );
  const chartTabs = (
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
  );
  const rangeButtons = (
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
  );
  const renderChart = (fill: boolean) => (
    <>
      {hasChart ? null : <ChartPlaceholder isLoading={timelineQuery.isPending} />}
      {hasChart && activeChart === 'gain' ? (
        <GainLossChart
          currency={chartCurrency}
          fill={fill}
          intraday={isIntraday}
          labels={chartLabels}
          points={heldPoints}
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
      {hasChart && activeChart === 'daily' ? (
        <PeriodChangeChart currency={chartCurrency} intraday={isIntraday} points={heldPoints} />
      ) : null}
      {hasChart && activeChart === 'value' ? (
        <ValueVsBaseChart
          currency={chartCurrency}
          fill={fill}
          intraday={isIntraday}
          labels={chartLabels}
          points={heldPoints}
        />
      ) : null}
      {hasChart && activeChart === 'price' ? (
        <PriceChart
          averageBuyPrice={averageBuyPrice}
          currency={chartCurrency}
          fill={fill}
          firstBought={firstBought}
          intraday={isIntraday}
          points={pricePoints}
        />
      ) : null}
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card className="min-w-0">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Investment Timeline</CardTitle>
              <ExpandButton
                className="-my-1"
                onClick={() => {
                  setExpanded(true);
                }}
              />
            </div>
            {viewPicker}
          </div>
          <div className="xl:min-h-10">{viewSummary}</div>
        </CardHeader>
        <CardContent className="space-y-4">
          {chartTabs}
          <div className="h-64">{renderChart(false)}</div>
          {rangeButtons}
        </CardContent>
      </Card>
      <FullScreenDialog open={expanded} setOpen={setExpanded} title="Investment Timeline">
        <div className="flex flex-1 flex-col gap-6 lg:min-h-0 lg:flex-row">
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">{findViewLabel(dashboard, viewSelection)}</h2>
              {isMultiSelect ? (
                <p className="text-muted-foreground text-sm">{MULTI_SELECT_NOTE}</p>
              ) : null}
            </div>
            {chartTabs}
            <div className="flex min-h-80 flex-1 flex-col">{renderChart(true)}</div>
            {rangeButtons}
          </div>
          <aside className="lg:w-sm lg:shrink-0 lg:overflow-y-auto">
            <TimelineViewList
              dashboard={dashboard}
              value={viewSelection}
              onSelect={setViewSelection}
            />
          </aside>
        </div>
      </FullScreenDialog>
      <AssetAllocationCard allocation={dashboard.assetAllocation} categories={categories} />
      <YourNumbersCard
        asOf={asOf}
        dashboard={dashboard}
        isLive={isLive}
        totalCharges={totalCharges}
      />
    </div>
  );
};
