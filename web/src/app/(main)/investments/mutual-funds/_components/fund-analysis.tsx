'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';

import { assetTypeLabel, percent, rupees, shortFundName } from './format';
import { FundBreakdownDialog } from './fund-breakdown-dialog';
import { HoldingsTable } from './holdings-table';
import {
  type Analysis,
  type Fund,
  type Slice,
  type Today,
  breakdownMoves,
  buildToday,
  signedPercent,
  signedRupees,
  toneFor,
  versusCategoryTone,
} from './today';

const LIVE_REFRESH_MS = 60_000;
const OVERLAP_STRONG = 50;
const OVERLAP_SCALE = 100;
const TOP_FUND_HOLDINGS = 5;
const RETURN_PERIODS = ['1y', '3y', '5y'] as const;
const ASSET_TYPE_CODE = /^[A-Z_]+$/;

const BREAKDOWNS = [
  { key: 'sectors', label: 'Sector' },
  { key: 'capBuckets', label: 'Market cap' },
  { key: 'assetTypes', label: 'Asset type' },
  { key: 'fundHouses', label: 'Fund house' },
  { key: 'categories', label: 'Category' },
] as const;

type BreakdownKey = (typeof BREAKDOWNS)[number]['key'];
const timeLabel = (value: Date | null) =>
  value === null
    ? ''
    : value.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

const shortDate = (value: Date | null) =>
  value === null ? '' : value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const Movement = ({
  label,
  detail,
  rupeeChange,
  percentChange,
}: {
  label: string;
  detail: React.ReactNode;
  rupeeChange: number;
  percentChange: number | null;
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-muted-foreground text-sm">{label}</span>
    <div className="flex items-baseline gap-2">
      <span className={cn('text-lg font-semibold tabular-nums', toneFor(rupeeChange))}>
        {signedRupees(rupeeChange)}
      </span>
      {percentChange === null ? null : (
        <span className={cn('text-sm tabular-nums', toneFor(percentChange))}>
          {signedPercent(percentChange)}
        </span>
      )}
    </div>
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">{detail}</span>
  </div>
);

const MovementBanner = ({ analysis, today }: { analysis: Analysis; today: Today | null }) => (
  <div className="grid gap-4 rounded-lg border px-4 py-3 sm:grid-cols-2">
    <Movement
      detail={`Official, from the NAVs published for ${shortDate(analysis.totals.latestNavDate)}`}
      label={`Last NAV change · ${shortDate(analysis.totals.latestNavDate)}`}
      percentChange={analysis.totals.navChangePercent}
      rupeeChange={analysis.totals.navChange}
    />
    {today === null ? null : (
      <Movement
        detail={
          <>
            <span
              className={cn(
                'size-2 rounded-full',
                today.marketOpen ? 'bg-green-600' : 'bg-muted-foreground',
              )}
            />
            {today.marketOpen ? 'Live' : 'Market closed'}
            {today.asOf === null ? '' : ` · as of ${timeLabel(today.asOf)}`}
            {' · from each stock’s move; NAV is published in the evening'}
          </>
        }
        label="Today, estimated"
        percentChange={today.totalPercent}
        rupeeChange={today.totalRupees}
      />
    )}
  </div>
);

const dateLabel = (value: Date | null) =>
  value === null
    ? 'unknown date'
    : value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const Stat = ({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  className?: string;
}) => (
  <div className={cn('flex flex-col gap-1 rounded-lg border p-3', className)}>
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="text-lg font-semibold tabular-nums">{value}</span>
    {detail === undefined ? null : <span className="text-muted-foreground text-xs">{detail}</span>}
  </div>
);

const SliceMove = ({
  move,
  value,
  className,
}: {
  move: number | undefined;
  value: number;
  className: string;
}) => {
  if (move === undefined || value === 0) {
    return <span className={className} />;
  }
  const change = (move / value) * OVERLAP_SCALE;
  return (
    <span className={cn('text-xs tabular-nums', toneFor(change), className)}>
      {signedPercent(change)} · {signedRupees(move)}
    </span>
  );
};

const SliceBars = ({
  slices,
  labelFor,
  moves,
}: {
  slices: Slice[];
  labelFor: (name: string) => string;
  moves: Map<string, number> | null;
}) => {
  const largest = Math.max(...slices.map((slice) => slice.share), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {slices.map((slice) => (
        <li key={slice.name} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{labelFor(slice.name)}</span>
            <span className="flex shrink-0 items-baseline tabular-nums">
              {rupees(slice.value)}
              <span className="text-muted-foreground ml-2 inline-block w-12 text-right">
                {percent(slice.share)}
              </span>
              {moves === null ? null : (
                <SliceMove
                  className="ml-3 hidden w-36 text-right sm:inline-block"
                  move={moves.get(slice.name)}
                  value={slice.value}
                />
              )}
            </span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${(Math.max(slice.share, 0) / largest) * OVERLAP_SCALE}%` }}
            />
          </div>
          {moves === null ? null : (
            <SliceMove
              className="text-right sm:hidden"
              move={moves.get(slice.name)}
              value={slice.value}
            />
          )}
        </li>
      ))}
    </ul>
  );
};

const Breakdowns = ({ analysis, today }: { analysis: Analysis; today: Today | null }) => {
  const [active, setActive] = useState<BreakdownKey>('sectors');
  const labelFor = (name: string) => (ASSET_TYPE_CODE.test(name) ? assetTypeLabel(name) : name);
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <CardTitle>Where the money sits</CardTitle>
        <div className="flex [scrollbar-width:none] gap-1 overflow-x-auto">
          {BREAKDOWNS.map((item) => (
            <Button
              key={item.key}
              className="shrink-0"
              size="sm"
              variant={item.key === active ? 'secondary' : 'ghost'}
              onClick={() => {
                setActive(item.key);
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <SliceBars
          labelFor={labelFor}
          moves={today === null ? null : breakdownMoves(analysis, today, active)}
          slices={analysis[active]}
        />
        {active === 'capBuckets' ? (
          <p className="text-muted-foreground mt-4 text-xs">
            Sized by market cap: large above ₹1 lakh crore, mid above ₹33,000 crore, small below.
            These approximate SEBI&apos;s top-100 and top-250 cut-offs.
          </p>
        ) : null}
        {active === 'sectors' ? (
          <p className="text-muted-foreground mt-4 text-xs">
            Equity by sector; debt, cash and other assets are listed by type.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

const Overlap = ({
  analysis,
  fundNames,
}: {
  analysis: Analysis;
  fundNames: Map<string, string>;
}) => {
  const codes = analysis.overlap.schemeCodes;
  if (codes.length < 2) {
    return null;
  }
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>How much your funds overlap</CardTitle>
        <CardDescription>
          Share of each pair&apos;s equity portfolio that is the same stocks at the same weights.
          High overlap means paying two fund houses for one portfolio.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-120 border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th />
              {codes.map((code, index) => (
                <th
                  key={code}
                  className="text-muted-foreground w-14 font-normal"
                  title={fundNames.get(code)}
                >
                  {index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.map((rowCode, row) => (
              <tr key={rowCode}>
                <th className="max-w-40 truncate pr-2 text-left font-normal" scope="row">
                  <span className="text-muted-foreground mr-1.5">{row + 1}</span>
                  {fundNames.get(rowCode)}
                </th>
                {codes.map((columnCode, column) => {
                  const value = analysis.overlap.matrix[row]?.[column] ?? 0;
                  if (row === column) {
                    return (
                      <td key={columnCode} className="text-muted-foreground text-center">
                        —
                      </td>
                    );
                  }
                  return (
                    <td
                      key={columnCode}
                      className={cn(
                        'rounded py-1.5 text-center tabular-nums',
                        value >= OVERLAP_STRONG ? 'text-primary-foreground font-medium' : '',
                      )}
                      style={{
                        backgroundColor: `color-mix(in oklch, var(--primary) ${String(Math.round(value))}%, transparent)`,
                      }}
                    >
                      {Math.round(value)}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

const ReturnsLine = ({ fund }: { fund: Fund }) => {
  const stats = fund.returnStats;
  if (stats === null) {
    return null;
  }
  return (
    <div className="grid grid-cols-4 gap-1 text-xs">
      <span className="text-muted-foreground">Returns</span>
      {RETURN_PERIODS.map((period) => {
        const own = stats.fund[period] ?? null;
        const category = stats.category[period] ?? null;
        return (
          <span key={period} className="flex flex-col items-end tabular-nums">
            <span className="text-muted-foreground uppercase">{period}</span>
            <span className={versusCategoryTone(own, category)}>
              {own === null ? '—' : percent(own)}
            </span>
            <span className="text-muted-foreground">
              {category === null ? '' : `cat ${percent(category)}`}
            </span>
          </span>
        );
      })}
    </div>
  );
};

const FundCard = ({
  fund,
  analysis,
  today,
  onOpen,
}: {
  fund: Fund;
  analysis: Analysis;
  today: Today | null;
  onOpen: () => void;
}) => {
  const todayPercent = today?.fundPercent.get(fund.schemeCode);
  const tracks = fund.benchmark === null ? '' : ` · tracks ${fund.benchmark}`;
  const footnote = fund.analysed
    ? `Portfolio as of ${dateLabel(fund.portfolioDate)}${tracks}`
    : 'Holdings not available for this fund yet';
  const top = analysis.companies
    .flatMap((company) =>
      company.funds
        .filter((item) => item.schemeCode === fund.schemeCode)
        .map((item) => ({ name: company.name, weight: item.weightPercent })),
    )
    .sort((left, right) => right.weight - left.weight)
    .slice(0, TOP_FUND_HOLDINGS);
  return (
    <Card
      className="hover:border-primary/40 cursor-pointer transition-colors"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <CardHeader>
        <CardTitle className="text-base leading-snug">{shortFundName(fund.schemeName)}</CardTitle>
        <CardDescription className="flex flex-wrap gap-1.5">
          {[fund.subCategory, fund.fundHouse].map((tag) =>
            tag === null ? null : (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ),
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <span className="text-muted-foreground">Your value</span>
          <span className="text-right tabular-nums">
            {rupees(fund.value)} · {percent(fund.share)}
          </span>
          <span className="text-muted-foreground">
            Last NAV change{fund.navDate === null ? '' : ` · ${shortDate(fund.navDate)}`}
          </span>
          <span className={cn('text-right tabular-nums', toneFor(fund.navChange))}>
            {fund.navChangePercent === null ? '' : `${signedPercent(fund.navChangePercent)} · `}
            {signedRupees(fund.navChange)}
          </span>
          {todayPercent === undefined ? null : (
            <>
              <span className="text-muted-foreground">Today, estimated</span>
              <span className={cn('text-right tabular-nums', toneFor(todayPercent))}>
                {signedPercent(todayPercent)} ·{' '}
                {signedRupees((fund.value * todayPercent) / OVERLAP_SCALE)}
              </span>
            </>
          )}
          <span className="text-muted-foreground">XIRR</span>
          <span className="text-right tabular-nums">
            {fund.xirr === null ? '—' : percent(fund.xirr, 2)}
          </span>
          <span className="text-muted-foreground">Expense ratio</span>
          <span className="text-right tabular-nums">
            {fund.expenseRatio === null ? '—' : percent(fund.expenseRatio, 2)}
            {fund.yearlyCost === null ? '' : ` · ${rupees(fund.yearlyCost)}/yr`}
          </span>
          <span className="text-muted-foreground">Fund size</span>
          <span className="text-right tabular-nums">
            {fund.aumCrore === null
              ? '—'
              : `₹${Math.round(fund.aumCrore).toLocaleString('en-IN')} cr`}
          </span>
          <span className="text-muted-foreground">Holdings</span>
          <span className="text-right tabular-nums">
            {fund.holdingsCount} · {percent(fund.equityShare)} equity
          </span>
        </div>
        <ReturnsLine fund={fund} />
        {top.length === 0 ? null : (
          <div className="flex flex-col gap-1 border-t pt-3 text-xs">
            <span className="text-muted-foreground">Top holdings</span>
            {top.map((item) => (
              <div key={item.name} className="flex justify-between gap-3">
                <span className="truncate">{item.name}</span>
                <span className="tabular-nums">{percent(item.weight, 2)}</span>
              </div>
            ))}
          </div>
        )}
        <span className="text-muted-foreground text-xs">{footnote}</span>
      </CardContent>
    </Card>
  );
};

const EmptyState = ({ isLoaded, hasError }: { isLoaded: boolean; hasError: boolean }) => {
  if (isLoaded) {
    return (
      <p className="text-muted-foreground text-sm">You do not hold any mutual funds right now.</p>
    );
  }
  return hasError ? (
    <p className="text-destructive text-sm">Could not load the analysis.</p>
  ) : (
    <LoadingState />
  );
};

const LoadingState = () => (
  <div className="flex flex-col gap-4">
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-64 w-full" />
    <Skeleton className="h-96 w-full" />
  </div>
);

const FundAnalysis = () => {
  const query = api.mutualFundAnalysis.getAnalysis.useQuery();
  const [openFund, setOpenFund] = useState<Fund | null>(null);
  const analysis = query.data;
  const liveQuery = api.mutualFundAnalysis.getLivePrices.useQuery(undefined, {
    enabled: analysis !== undefined,
    refetchInterval: (current) =>
      current.state.data?.marketOpen === true ? LIVE_REFRESH_MS : false,
  });
  const live = liveQuery.data;
  const today = useMemo(
    () => (analysis === undefined || live === undefined ? null : buildToday(analysis, live)),
    [analysis, live],
  );
  const fundNames = useMemo(
    () =>
      new Map(
        (analysis?.funds ?? []).map((fund) => [fund.schemeCode, shortFundName(fund.schemeName)]),
      ),
    [analysis?.funds],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
          href="/investments"
        >
          <ArrowLeft className="size-4" />
          Investments
        </Link>
        <h2 className="text-xl font-semibold">Mutual fund analysis</h2>
        <p className="text-muted-foreground text-sm">
          {analysis === undefined
            ? 'Looking through every fund to the companies and bonds it holds.'
            : `Looking through ${String(analysis.funds.length)} funds to the companies and bonds they hold, from portfolios disclosed on ${dateLabel(analysis.totals.oldestPortfolioDate)}.`}
        </p>
      </div>
      {analysis === undefined || analysis.funds.length === 0 ? (
        <EmptyState hasError={query.isError} isLoaded={analysis !== undefined} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat
              detail={`${rupees(analysis.totals.invested)} invested`}
              label="Value"
              value={rupees(analysis.totals.value)}
            />
            <Stat
              detail={`${percent(analysis.totals.equityShare)} of money in equity`}
              label="Companies held"
              value={String(analysis.totals.companies)}
            />
            <Stat
              detail="of your fund money"
              label="Top 10 companies"
              value={percent(analysis.totals.topCompaniesShare)}
            />
            <Stat
              detail={`${rupees(analysis.totals.yearlyCost)} a year in fees`}
              label="Average expense ratio"
              value={
                analysis.totals.weightedExpenseRatio === null
                  ? '—'
                  : percent(analysis.totals.weightedExpenseRatio, 2)
              }
            />
            <Stat
              className="col-span-2 lg:col-span-1"
              detail={[...new Set(analysis.funds.flatMap((fund) => fund.subCategory ?? []))].join(
                ', ',
              )}
              label="Funds"
              value={String(analysis.funds.length)}
            />
          </div>
          <MovementBanner analysis={analysis} today={today} />
          <div className="grid gap-4 xl:grid-cols-2">
            <Breakdowns analysis={analysis} today={today} />
            <Overlap analysis={analysis} fundNames={fundNames} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {analysis.funds.map((fund) => (
              <FundCard
                key={fund.schemeCode}
                analysis={analysis}
                fund={fund}
                today={today}
                onOpen={() => {
                  setOpenFund(fund);
                }}
              />
            ))}
          </div>
          <HoldingsTable analysis={analysis} fundNames={fundNames} today={today} />
          <FundBreakdownDialog
            analysis={analysis}
            fund={openFund}
            onClose={() => {
              setOpenFund(null);
            }}
          />
        </>
      )}
    </div>
  );
};

export default FundAnalysis;
