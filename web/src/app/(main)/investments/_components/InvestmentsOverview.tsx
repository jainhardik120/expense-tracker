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
import { investmentKindLabels, type InvestmentKindValue } from '@/lib/investments';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

type DashboardData = RouterOutput['investments']['getInvestmentsDashboard'];

const PORTFOLIO_VIEW = '__portfolio__';
const TIME_RANGE_OPTIONS = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: 'lifetime', label: 'Lifetime' },
] as const;
type TimeRangeValue = (typeof TIME_RANGE_OPTIONS)[number]['value'];
const TIME_RANGE_DAYS: Partial<Record<TimeRangeValue, number>> = {
  '1d': 1,
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '6m': 180,
};

const toViewValue = (kind: InvestmentKindValue, code: string) => `${kind}|${code}`;

const parseViewValue = (value: string): { kind: InvestmentKindValue; code: string } | null => {
  const [kind, ...codeParts] = value.split('|');
  if (codeParts.length === 0) {
    return null;
  }
  const code = codeParts.join('|');
  if (
    kind === 'fd' ||
    kind === 'stocks' ||
    kind === 'mutual_funds' ||
    kind === 'crypto' ||
    kind === 'other'
  ) {
    return {
      kind,
      code,
    };
  }
  return null;
};

export const InvestmentsOverview = ({ dashboard }: { dashboard: DashboardData }) => {
  const [viewSelection, setViewSelection] = useState(PORTFOLIO_VIEW);
  const [timeRange, setTimeRange] = useState<TimeRangeValue>('lifetime');

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
      return option.kind === parsed.kind && option.code === parsed.code;
    });
  }, [dashboard.instrumentOptions, viewSelection]);

  const selectedInstrumentKey = parseViewValue(viewSelection);
  const instrumentTimelineQuery = api.investments.getInstrumentTimeline.useQuery(
    selectedInstrumentKey ?? { kind: 'stocks', code: '' },
    {
      enabled: selectedInstrumentKey !== null,
    },
  );

  const isPortfolioView = viewSelection === PORTFOLIO_VIEW;

  const chartRows = useMemo(() => {
    const cutoffDays = TIME_RANGE_DAYS[timeRange];
    const cutoffDate =
      cutoffDays === undefined ? null : subDays(startOfDay(new Date()), cutoffDays - 1).getTime();
    const sourcePoints = isPortfolioView
      ? dashboard.timeline.map((point) => ({
          date: point.date,
          investedAmount: point.investedAmount,
          valuationAmount: point.valuationAmount,
          pnl: point.pnl,
        }))
      : (instrumentTimelineQuery.data?.points ?? []).map((point) => ({
          date: point.date,
          holdingValue: point.holdingValue,
          unitPrice: point.unitPrice,
        }));

    return sourcePoints
      .filter((point) => {
        if (cutoffDate === null) {
          return true;
        }
        return startOfDay(point.date).getTime() >= cutoffDate;
      })
      .map((point) => ({
        ...point,
        date: format(point.date, 'dd MMM'),
      }));
  }, [dashboard.timeline, instrumentTimelineQuery.data?.points, isPortfolioView, timeRange]);

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
            className={`text-xl font-semibold ${dashboard.summary.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
          >
            {formatCurrency(dashboard.summary.pnl)}
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
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Investment Timeline</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={timeRange} onValueChange={(value) => { setTimeRange(value as TimeRangeValue); }}>
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
                          key={toViewValue(option.kind, option.code)}
                          value={toViewValue(option.kind, option.code)}
                        >
                          {option.name} ({option.code})
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
              {selectedInstrument.name} ({selectedInstrument.code}) - Units{' '}
              {selectedInstrument.units.toFixed(4)} - Value{' '}
              {formatCurrency(selectedInstrument.valuationAmount)} - P/L{' '}
              <span className={selectedInstrument.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(selectedInstrument.pnl)}
              </span>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {chartRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {instrumentTimelineQuery.isFetching
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
                      holdingValue: { label: 'Holding Value' },
                      unitPrice: { label: 'Unit Price' },
                    },
                data: chartRows,
              }}
              dot={false}
            />
          )}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.kindBreakdown.map((kindItem) => (
              <div key={kindItem.kind} className="bg-muted/40 rounded-md border p-3 text-sm">
                <div className="font-semibold">{investmentKindLabels[kindItem.kind]}</div>
                <div className="text-muted-foreground">
                  {kindItem.openPositions} open / {kindItem.closedPositions} closed
                </div>
                <div>{formatCurrency(kindItem.valuationAmount)}</div>
              </div>
            ))}
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
            . Attribution guide:{' '}
            <a
              className="underline underline-offset-2"
              href="https://brand.coingecko.com/resources/attribution-guide"
              rel="noreferrer"
              target="_blank"
            >
              CoinGecko Attribution
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
