export const FX_RATE_DECIMALS = 4;

export const investmentKindValues = [
  'fd',
  'stocks',
  'mutual_funds',
  'crypto',
  'commodities',
  'epfo',
  'other',
] as const;

export type InvestmentKindValue = (typeof investmentKindValues)[number];

export const investmentCategoryValues = [
  'fd',
  'stocks',
  'rsu',
  'mutual_funds',
  'crypto',
  'commodities',
  'epfo',
  'other',
] as const;

export type InvestmentCategoryValue = (typeof investmentCategoryValues)[number];

export const assetClassTagValues = ['gold', 'silver'] as const;

export type AssetClassTagValue = (typeof assetClassTagValues)[number];

export type AssetClassValue = 'market' | AssetClassTagValue | 'fd' | 'crypto' | 'epfo' | 'other';

export const assetClassLabels: Record<AssetClassValue, string> = {
  market: 'Market',
  gold: 'Gold',
  silver: 'Silver',
  fd: 'Fixed deposits',
  crypto: 'Crypto',
  epfo: 'EPFO',
  other: 'Other',
};

export const canTagAssetClass = (kind: InvestmentKindValue): boolean => {
  return kind === 'stocks' || kind === 'mutual_funds';
};

export const getAssetClass = (
  kind: InvestmentKindValue,
  code: string | null,
  tag: AssetClassTagValue | null | undefined,
): AssetClassValue => {
  if (kind === 'stocks' || kind === 'mutual_funds') {
    return tag ?? 'market';
  }
  if (kind === 'commodities') {
    const normalized = code?.trim().toLowerCase();
    return normalized === 'gold' || normalized === 'silver' ? normalized : 'other';
  }
  return kind;
};

export const stockMarketValues = ['IN', 'US'] as const;

export type StockMarketValue = (typeof stockMarketValues)[number];

export const stockMarketLabels: Record<StockMarketValue, string> = {
  IN: 'India (NSE/BSE)',
  US: 'United States (NYSE/NASDAQ)',
};

export const investmentKindLabels: Record<InvestmentKindValue, string> = {
  fd: 'Fixed Deposit',
  stocks: 'Stocks',
  mutual_funds: 'Mutual Funds',
  crypto: 'Crypto Currency',
  commodities: 'Commodities',
  epfo: 'EPFO',
  other: 'Other',
};

export const investmentCategoryLabels: Record<InvestmentCategoryValue, string> = {
  ...investmentKindLabels,
  rsu: 'RSU',
};

export const getInvestmentCategory = (
  kind: InvestmentKindValue,
  isRsu: boolean,
): InvestmentCategoryValue => {
  return kind === 'stocks' && isRsu ? 'rsu' : kind;
};

export const compareInvestmentCategories = (
  left: InvestmentCategoryValue,
  right: InvestmentCategoryValue,
): number => {
  return investmentCategoryValues.indexOf(left) - investmentCategoryValues.indexOf(right);
};

const kindAliases: Record<string, InvestmentKindValue> = {
  fd: 'fd',
  fixed_deposit: 'fd',
  fixeddeposit: 'fd',
  fixed_deposits: 'fd',
  stock: 'stocks',
  stocks: 'stocks',
  equity: 'stocks',
  equities: 'stocks',
  mutual_funds: 'mutual_funds',
  mutualfunds: 'mutual_funds',
  mutual_fund: 'mutual_funds',
  mutualfund: 'mutual_funds',
  mf: 'mutual_funds',
  crypto: 'crypto',
  cryptocurrency: 'crypto',
  cryptocurrencies: 'crypto',
  digital_asset: 'crypto',
  commodity: 'commodities',
  commodities: 'commodities',
  gold: 'commodities',
  silver: 'commodities',
  epfo: 'epfo',
  employee_provident_fund: 'epfo',
  provident_fund: 'epfo',
  pf: 'epfo',
  other: 'other',
};

export const normalizeInvestmentKind = (kind: string | null | undefined): InvestmentKindValue => {
  const normalized = (kind ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, '_');
  return kindAliases[normalized] ?? 'other';
};

const unitPricedInvestmentKinds = new Set<InvestmentKindValue>([
  'stocks',
  'mutual_funds',
  'crypto',
  'commodities',
]);

export const isUnitBasedInvestment = (kind: InvestmentKindValue): boolean => {
  return unitPricedInvestmentKinds.has(kind);
};

export const isLivePriceInvestment = (kind: InvestmentKindValue): boolean => {
  return unitPricedInvestmentKinds.has(kind);
};

export const normalizeStockMarket = (
  market: string | null | undefined,
  fallback: StockMarketValue = 'IN',
): StockMarketValue => {
  const normalized = (market ?? '').trim().toUpperCase();
  if (normalized === 'US') {
    return 'US';
  }
  if (normalized === 'IN') {
    return 'IN';
  }
  return fallback;
};

export const investmentTimelineRangeValues = ['1d', '1w', '1m', '3m', '6m', 'lifetime'] as const;

export type InvestmentTimelineRangeValue = (typeof investmentTimelineRangeValues)[number];

export const investmentTimelineRangeDays: Partial<Record<InvestmentTimelineRangeValue, number>> = {
  '1d': 1,
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '6m': 180,
};

export type TimelineFilters = { start?: Date; end?: Date; investmentKind: string[] };
