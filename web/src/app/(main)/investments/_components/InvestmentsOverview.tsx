'use client';

import { useMemo, useState } from 'react';

import { format } from 'date-fns';

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

  const portfolioChartData = useMemo(() => {
    return dashboard.timeline.map((point) => ({
      date: format(point.date, 'dd MMM'),
      investedAmount: point.investedAmount,
      valuationAmount: point.valuationAmount,
      pnl: point.pnl,
    }));
  }, [dashboard.timeline]);

  const instrumentChartData = useMemo(() => {
    const points = instrumentTimelineQuery.data?.points ?? [];
    return points.map((point) => ({
      date: format(point.date, 'dd MMM'),
      holdingValue: point.holdingValue,
      unitPrice: point.unitPrice,
    }));
  }, [instrumentTimelineQuery.data?.points]);

  const isPortfolioView = viewSelection === PORTFOLIO_VIEW;
  const chartRows = isPortfolioView ? portfolioChartData : instrumentChartData;

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
        </CardContent>
      </Card>
    </div>
  );
};
