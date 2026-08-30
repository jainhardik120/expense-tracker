'use client';

import { useMemo, useState } from 'react';

import { format, startOfDay, subDays } from 'date-fns';

import LineChart from '@/components/line-chart';
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
import { formatCurrency } from '@/lib/format';
import {
  investmentCategoryLabels,
  type InvestmentCategoryValue,
  investmentKindLabels,
  investmentKindValues,
  type InvestmentKindValue,
  type InvestmentTimelineRangeValue,
  investmentTimelineRangeDays,
  normalizeStockMarket,
  type StockMarketValue,
} from '@/lib/investments';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { getExcludedPortfolioDescription, getExcludedPortfolioTag } from './display';

type DashboardData = RouterOutput['investments']['getInvestmentsPageData']['dashboard'];
type InstrumentTimelineEntry =
  RouterOutput['investments']['getInvestmentsPageData']['instrumentTimelines'][number];
type TimelineFilters = {
  start?: Date;
  end?: Date;
  investmentKind: string[];
};

const PORTFOLIO_VIEW = '__portfolio__';
const POSITIVE_TONE = 'text-green-600';
const NEGATIVE_TONE = 'text-red-600';
const UNITS_DECIMALS = 4;
const USD_CURRENCY = 'USD';

const TIME_RANGE_OPTIONS: Array<{ value: InvestmentTimelineRangeValue; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: 'lifetime', label: 'Lifetime' },
];

const toViewValue = (
  kind: InvestmentKindValue,
  code: string,
  stockMarket: StockMarketValue | null,
) => `${kind}|${stockMarket ?? 'NA'}|${code}`;

const parseViewValue = (
  value: string,
): { kind: InvestmentKindValue; code: string; stockMarket: StockMarketValue | null } | null => {
  const [kind, stockMarketRaw, ...codeParts] = value.split('|');
  if (codeParts.length === 0) {
    return null;
  }
  const code = codeParts.join('|');
  const normalizedStockMarket =
    stockMarketRaw === 'NA' ? null : normalizeStockMarket(stockMarketRaw);
  if (investmentKindValues.includes(kind as InvestmentKindValue)) {
    return {
      kind: kind as InvestmentKindValue,
      stockMarket: normalizedStockMarket,
      code,
    };
  }
  return null;
};

const formatByCurrency = (amount: number, currency: string) => {
  const locale = currency === USD_CURRENCY ? 'en-US' : 'en-IN';
  return formatCurrency(amount, currency, locale);
};

export const InvestmentsOverview = ({
  dashboard,
  instrumentTimelines,
  filters,
  selectedCategories,
  onCategoryToggle,
}: {
  dashboard: DashboardData;
  instrumentTimelines: InstrumentTimelineEntry[];
  filters: TimelineFilters;
  selectedCategories: Set<InvestmentCategoryValue>;
  onCategoryToggle: (category: InvestmentCategoryValue) => void;
}) => {
  const [viewSelection, setViewSelection] = useState(PORTFOLIO_VIEW);
  const [timeRange, setTimeRange] = useState<InvestmentTimelineRangeValue>('1m');

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

  const isPortfolioView = viewSelection === PORTFOLIO_VIEW;
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
  const remotePortfolioTimeline = [
    ...remoteTimelineData
      .flatMap((data) => data.timeline)
      .reduce((points, point) => {
        const key = point.date.toISOString();
        const existing = points.get(key) ?? {
          date: point.date,
          investedAmount: 0,
          valuationAmount: 0,
          pnl: 0,
        };
        existing.investedAmount += point.investedAmount;
        existing.valuationAmount += point.valuationAmount;
        existing.pnl += point.pnl;
        points.set(key, existing);
        return points;
      }, new Map<string, DashboardData['timeline'][number]>())
      .values(),
  ].sort((left, right) => left.date.getTime() - right.date.getTime());

  let selectedTimelineEntries = instrumentTimelines;
  let portfolioTimeline = dashboard.timeline;
  if (requiresRemoteTimeline) {
    selectedTimelineEntries = remoteTimelineData.flatMap((data) => data.instrumentTimelines);
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

  const chartRows = useMemo(() => {
    const sourcePoints = isPortfolioView
      ? portfolioTimeline.map((point) => ({
          date: point.date,
          investedAmount: point.investedAmount,
          valuationAmount: point.valuationAmount,
          pnl: point.pnl,
        }))
      : (instrumentTimelineMap.get(viewSelection)?.points ?? []).map((point) => ({
          date: point.date,
          holdingValue: point.holdingValue,
          unitPrice: point.unitPrice,
        }));

    const days = investmentTimelineRangeDays[timeRange];
    const cutoffDate =
      requiresRemoteTimeline || days === undefined
        ? null
        : subDays(startOfDay(new Date()), days - 1).getTime();

    return sourcePoints
      .filter((point) => {
        if (cutoffDate === null) {
          return true;
        }
        return startOfDay(point.date).getTime() >= cutoffDate;
      })
      .map((point) => ({
        ...point,
        date: format(point.date, timeRange === 'lifetime' ? 'dd MMM yyyy' : 'dd MMM'),
      }));
  }, [
    instrumentTimelineMap,
    isPortfolioView,
    portfolioTimeline,
    requiresRemoteTimeline,
    timeRange,
    viewSelection,
  ]);

  const isLoadingTimeline =
    requiresRemoteTimeline &&
    timelineQueries.some((query) => query.isFetching) &&
    chartRows.length === 0;
  const selectedCurrency = selectedInstrument?.displayCurrency ?? 'INR';

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
            <div className="flex flex-wrap items-center gap-2">
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
                <SelectTrigger className="w-[22rem] max-w-full">
                  <SelectValue placeholder="Select portfolio or instrument" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Portfolio</SelectLabel>
                    <SelectItem value={PORTFOLIO_VIEW}>All Investments</SelectItem>
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
          {!isPortfolioView && selectedInstrument !== null && selectedInstrument !== undefined ? (
            <div className="text-muted-foreground text-sm">
              {selectedInstrument.name} ({selectedInstrument.code}
              {selectedInstrument.kind === 'stocks' && selectedInstrument.stockMarket !== null
                ? ` - ${selectedInstrument.stockMarket}`
                : ''}
              ) - Units {selectedInstrument.units.toFixed(UNITS_DECIMALS)} - Value{' '}
              {formatByCurrency(selectedInstrument.valuationAmount, selectedCurrency)} - P/L{' '}
              <span className={selectedInstrument.pnl >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
                {formatByCurrency(selectedInstrument.pnl, selectedCurrency)}
              </span>{' '}
              - 1D{' '}
              <span className={selectedInstrument.dayChange >= 0 ? POSITIVE_TONE : NEGATIVE_TONE}>
                {formatByCurrency(selectedInstrument.dayChange, selectedCurrency)}
              </span>
              {getExcludedPortfolioDescription(selectedInstrument)}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {chartRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {isLoadingTimeline
                ? 'Loading timeline...'
                : 'No timeline data available for the selected view.'}
            </p>
          ) : (
            <LineChart
              data={{
                primaryAxis: {
                  key: 'date',
                  label: 'Date',
                },
                secondaryAxes: isPortfolioView
                  ? {
                      investedAmount: { label: 'Invested' },
                      valuationAmount: { label: 'Current Value' },
                      pnl: { label: 'P/L' },
                    }
                  : {
                      holdingValue: {
                        label:
                          selectedInstrument?.displayCurrency === USD_CURRENCY
                            ? 'Holding Value (USD)'
                            : 'Holding Value',
                      },
                      unitPrice: {
                        label:
                          selectedInstrument?.displayCurrency === USD_CURRENCY
                            ? 'Unit Price (USD)'
                            : 'Unit Price',
                      },
                    },
                data: chartRows,
              }}
              dot={false}
              type="monotone"
            />
          )}

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
