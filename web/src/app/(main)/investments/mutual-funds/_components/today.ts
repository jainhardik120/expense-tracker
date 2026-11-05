import { type RouterOutput } from '@/server/routers';

import { rupees } from './format';

const PERCENT = 100;

export type Analysis = RouterOutput['mutualFundAnalysis']['getAnalysis'];
export type Slice = Analysis['sectors'][number];
export type Company = Analysis['companies'][number];
export type Fund = Analysis['funds'][number];
export type LiveData = RouterOutput['mutualFundAnalysis']['getLivePrices'];
type Quote = LiveData['quotes'][string];
export type Today = {
  quotes: Map<string, Quote>;
  impactByCompany: Map<string, number>;
  fundPercent: Map<string, number>;
  totalRupees: number;
  totalPercent: number;
  marketOpen: boolean;
  asOf: Date | null;
  estimatedFunds: number;
  awaitingNav: Set<string>;
};

const DAY_KEY_LENGTH = 10;

export const toneFor = (value: number) => {
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

export const signedPercent = (value: number, decimals = 2) =>
  `${value > 0 ? '+' : ''}${value.toFixed(decimals)}%`;

export const signedRupees = (value: number) =>
  Math.round(Math.abs(value)) === 0 ? rupees(0) : `${signFor(value)}${rupees(Math.abs(value))}`;

export const versusCategoryTone = (own: number | null, category: number | null) => {
  if (own === null || category === null) {
    return '';
  }
  return own >= category ? 'text-green-600' : 'text-red-600';
};

export const buildToday = (analysis: Analysis, live: LiveData): Today => {
  const impactByCompany = new Map<string, number>();
  const fundPercent = new Map<string, number>();
  const quotes = new Map(Object.entries(live.quotes));
  const awaitingNav = new Set(
    analysis.funds
      .filter(
        (fund) =>
          live.tradingDay !== null &&
          (fund.navDate?.toISOString().slice(0, DAY_KEY_LENGTH) ?? '') < live.tradingDay,
      )
      .map((fund) => fund.schemeCode),
  );
  for (const company of analysis.companies) {
    const change = quotes.get(company.key)?.dayChangePercent ?? null;
    if (change === null) {
      continue;
    }
    for (const fund of company.funds) {
      if (awaitingNav.has(fund.schemeCode)) {
        impactByCompany.set(
          company.key,
          (impactByCompany.get(company.key) ?? 0) + (fund.value * change) / PERCENT,
        );
        fundPercent.set(
          fund.schemeCode,
          (fundPercent.get(fund.schemeCode) ?? 0) + (fund.weightPercent * change) / PERCENT,
        );
      }
    }
  }
  const totalRupees = analysis.funds.reduce(
    (total, fund) => total + (fund.value * (fundPercent.get(fund.schemeCode) ?? 0)) / PERCENT,
    0,
  );
  return {
    quotes,
    impactByCompany,
    fundPercent,
    totalRupees,
    totalPercent: analysis.totals.value === 0 ? 0 : (totalRupees / analysis.totals.value) * PERCENT,
    marketOpen: live.marketOpen,
    asOf: live.asOf,
    estimatedFunds: fundPercent.size,
    awaitingNav,
  };
};

export type BreakdownMoveKey =
  'sectors' | 'capBuckets' | 'assetTypes' | 'fundHouses' | 'categories';

const EQUITY = 'EQUITY';
const UNSPECIFIED = 'Unspecified';

const addTo = (totals: Map<string, number>, key: string, value: number) => {
  totals.set(key, (totals.get(key) ?? 0) + value);
};

export const breakdownMoves = (
  analysis: Analysis,
  today: Today,
  key: BreakdownMoveKey,
): Map<string, number> => {
  const moves = new Map<string, number>();
  if (key === 'fundHouses' || key === 'categories') {
    for (const fund of analysis.funds) {
      const name =
        key === 'fundHouses'
          ? (fund.fundHouse ?? UNSPECIFIED)
          : (fund.subCategory ?? fund.category ?? UNSPECIFIED);
      addTo(moves, name, (fund.value * (today.fundPercent.get(fund.schemeCode) ?? 0)) / PERCENT);
    }
    return moves;
  }
  for (const company of analysis.companies) {
    const impact = today.impactByCompany.get(company.key);
    if (impact === undefined) {
      continue;
    }
    const sector = company.assetType === EQUITY ? company.sector : company.assetType;
    const name = { sectors: sector, capBuckets: company.capBucket, assetTypes: company.assetType }[
      key
    ];
    addTo(moves, name, impact);
  }
  return moves;
};
