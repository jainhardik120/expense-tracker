'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';

import { ArrowLeft, ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { assetTypeLabel, percent, rupees, shortFundName } from './format';

type Analysis = RouterOutput['mutualFundAnalysis']['getAnalysis'];
type Slice = Analysis['sectors'][number];
type Company = Analysis['companies'][number];
type Fund = Analysis['funds'][number];
type LiveData = RouterOutput['mutualFundAnalysis']['getLivePrices'];
type Quote = LiveData['quotes'][string];
type Today = {
  quotes: Map<string, Quote>;
  impactByCompany: Map<string, number>;
  fundPercent: Map<string, number>;
  totalRupees: number;
  totalPercent: number;
  marketOpen: boolean;
  asOf: Date | null;
};
type CompanySort = 'exposure' | 'movers' | 'gainers' | 'losers';

const LIVE_REFRESH_MS = 60_000;
const COMPANY_SORTS: Array<{ key: CompanySort; label: string }> = [
  { key: 'exposure', label: 'Largest' },
  { key: 'movers', label: "Today's movers" },
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
];

const COMPANIES_PREVIEW = 25;
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

const toneFor = (value: number) => {
  if (value > 0) {
    return 'text-green-600';
  }
  return value < 0 ? 'text-red-600' : 'text-muted-foreground';
};

const signFor = (value: number) => {
  if (value > 0) {
    return '+';
  }
  return value < 0 ? '-' : '';
};

const signedPercent = (value: number, decimals = 2) =>
  `${value > 0 ? '+' : ''}${value.toFixed(decimals)}%`;

const signedRupees = (value: number) => `${signFor(value)}${rupees(Math.abs(value))}`;

const versusCategoryTone = (own: number | null, category: number | null) => {
  if (own === null || category === null) {
    return '';
  }
  return own >= category ? 'text-green-600' : 'text-red-600';
};

const buildToday = (analysis: Analysis, live: LiveData): Today => {
  const impactByCompany = new Map<string, number>();
  const fundPercent = new Map<string, number>();
  const quotes = new Map(Object.entries(live.quotes));
  for (const company of analysis.companies) {
    const change = quotes.get(company.key)?.dayChangePercent ?? null;
    if (change === null) {
      continue;
    }
    impactByCompany.set(company.key, (company.value * change) / OVERLAP_SCALE);
    for (const fund of company.funds) {
      fundPercent.set(
        fund.schemeCode,
        (fundPercent.get(fund.schemeCode) ?? 0) + (fund.weightPercent * change) / OVERLAP_SCALE,
      );
    }
  }
  const totalRupees = analysis.funds.reduce(
    (total, fund) => total + (fund.value * (fundPercent.get(fund.schemeCode) ?? 0)) / OVERLAP_SCALE,
    0,
  );
  return {
    quotes,
    impactByCompany,
    fundPercent,
    totalRupees,
    totalPercent:
      analysis.totals.value === 0 ? 0 : (totalRupees / analysis.totals.value) * OVERLAP_SCALE,
    marketOpen: live.marketOpen,
    asOf: live.asOf,
  };
};

const timeLabel = (value: Date | null) =>
  value === null
    ? ''
    : value.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

const TodayBanner = ({ today }: { today: Today }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border px-4 py-3">
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-sm">Your funds today, estimated</span>
      <span className={cn('text-lg font-semibold tabular-nums', toneFor(today.totalRupees))}>
        {signedRupees(today.totalRupees)}
      </span>
      <span className={cn('text-sm tabular-nums', toneFor(today.totalPercent))}>
        {signedPercent(today.totalPercent)}
      </span>
    </div>
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          'size-2 rounded-full',
          today.marketOpen ? 'bg-green-600' : 'bg-muted-foreground',
        )}
      />
      {today.marketOpen ? 'Live' : 'Market closed'}
      {today.asOf === null ? '' : ` · as of ${timeLabel(today.asOf)}`}
      {' · from each stock’s move today; NAV is published in the evening'}
    </span>
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

const SliceBars = ({
  slices,
  labelFor,
}: {
  slices: Slice[];
  labelFor: (name: string) => string;
}) => {
  const largest = Math.max(...slices.map((slice) => slice.share), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {slices.map((slice) => (
        <li key={slice.name} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{labelFor(slice.name)}</span>
            <span className="shrink-0 tabular-nums">
              {rupees(slice.value)}
              <span className="text-muted-foreground ml-2 inline-block w-12 text-right">
                {percent(slice.share)}
              </span>
            </span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${(Math.max(slice.share, 0) / largest) * OVERLAP_SCALE}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

const Breakdowns = ({ analysis }: { analysis: Analysis }) => {
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
        <SliceBars labelFor={labelFor} slices={analysis[active]} />
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

const CompanyRow = ({
  company,
  fundNames,
  quote,
  impact,
}: {
  company: Company;
  fundNames: Map<string, string>;
  quote: Quote | undefined;
  impact: number | undefined;
}) => {
  const [open, setOpen] = useState(false);
  const isEquity = company.assetType === 'EQUITY';
  const change = quote?.dayChangePercent ?? null;
  return (
    <li className="border-b last:border-b-0">
      <button
        aria-expanded={open}
        className="hover:bg-muted/50 flex w-full items-center gap-3 px-1 py-2.5 text-left"
        type="button"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{company.name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {quote === undefined ? '' : `₹${quote.price.toLocaleString('en-IN')} · `}
            {company.funds.length === 1 ? '1 fund' : `${String(company.funds.length)} funds`}
            {' · '}
            {isEquity
              ? [company.industry ?? company.sector, company.capBucket].join(' · ')
              : assetTypeLabel(company.assetType)}
          </span>
        </div>
        <div className="flex w-28 shrink-0 flex-col items-end gap-0.5">
          <span className="text-sm tabular-nums">{rupees(company.value)}</span>
          {change === null ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {percent(company.share, 2)}
            </span>
          ) : (
            <span className={cn('text-xs tabular-nums', toneFor(change))}>
              {signedPercent(change)}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn('text-muted-foreground size-4 shrink-0 transition-transform', {
            'rotate-180': open,
          })}
        />
      </button>
      {open ? (
        <ul className="bg-muted/30 mb-2 flex flex-col gap-1.5 rounded-md px-3 py-2 text-xs">
          {company.funds.map((fund) => (
            <li key={fund.schemeCode} className="flex justify-between gap-3">
              <span className="truncate">{fundNames.get(fund.schemeCode) ?? fund.schemeCode}</span>
              <span className="shrink-0 tabular-nums">
                {rupees(fund.value)}
                <span className="text-muted-foreground ml-2">
                  {percent(fund.weightPercent, 2)} of fund
                </span>
              </span>
            </li>
          ))}
          <li className="text-muted-foreground">
            {percent(company.share, 2)} of your fund money
            {impact === undefined ? '' : ` · ${signedRupees(impact)} for you today`}
          </li>
          {company.marketCapCrore === null ? null : (
            <li className="text-muted-foreground">
              Market cap ₹{Math.round(company.marketCapCrore).toLocaleString('en-IN')} crore
            </li>
          )}
        </ul>
      ) : null}
    </li>
  );
};

const Companies = ({
  analysis,
  fundNames,
  today,
}: {
  analysis: Analysis;
  fundNames: Map<string, string>;
  today: Today | null;
}) => {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<CompanySort>('exposure');
  const sorted = useMemo(() => {
    if (sort === 'exposure' || today === null) {
      return analysis.companies;
    }
    const impact = (company: Company) => today.impactByCompany.get(company.key);
    const priced = analysis.companies.filter((company) => impact(company) !== undefined);
    if (sort === 'movers') {
      return priced.toSorted(
        (left, right) => Math.abs(impact(right) ?? 0) - Math.abs(impact(left) ?? 0),
      );
    }
    const direction = sort === 'gainers' ? 1 : -1;
    return priced
      .filter((company) => direction * (impact(company) ?? 0) > 0)
      .toSorted((left, right) => direction * ((impact(right) ?? 0) - (impact(left) ?? 0)));
  }, [analysis.companies, sort, today]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === ''
      ? sorted
      : sorted.filter((company) =>
          [company.name, company.sector, company.industry ?? '']
            .join(' ')
            .toLowerCase()
            .includes(needle),
        );
  }, [sorted, query]);
  const visible = showAll || query.trim() !== '' ? matches : matches.slice(0, COMPANIES_PREVIEW);
  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>What you own underneath</CardTitle>
        <CardDescription>
          Your money in each fund multiplied by that fund&apos;s weight in each holding, added up
          across funds.
        </CardDescription>
        <Input
          placeholder="Search a company, sector or industry"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        {today === null ? null : (
          <div className="flex [scrollbar-width:none] gap-1 overflow-x-auto">
            {COMPANY_SORTS.map((item) => (
              <Button
                key={item.key}
                className="shrink-0"
                size="sm"
                variant={item.key === sort ? 'secondary' : 'ghost'}
                onClick={() => {
                  setSort(item.key);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {visible.map((company) => (
            <CompanyRow
              key={company.key}
              company={company}
              fundNames={fundNames}
              impact={today?.impactByCompany.get(company.key)}
              quote={today?.quotes.get(company.key)}
            />
          ))}
        </ul>
        {matches.length > visible.length ? (
          <Button
            className="mt-3 w-full"
            variant="outline"
            onClick={() => {
              setShowAll(true);
            }}
          >
            Show all {matches.length} holdings
          </Button>
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
}: {
  fund: Fund;
  analysis: Analysis;
  today: Today | null;
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
    <Card>
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
          {today === null ? null : <TodayBanner today={today} />}
          <div className="grid gap-4 xl:grid-cols-2">
            <Breakdowns analysis={analysis} />
            <Overlap analysis={analysis} fundNames={fundNames} />
          </div>
          <Companies analysis={analysis} fundNames={fundNames} today={today} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {analysis.funds.map((fund) => (
              <FundCard key={fund.schemeCode} analysis={analysis} fund={fund} today={today} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default FundAnalysis;
