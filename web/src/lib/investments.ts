export const investmentKindValues = ['fd', 'stocks', 'mutual_funds', 'crypto', 'other'] as const;

export type InvestmentKindValue = (typeof investmentKindValues)[number];

export const investmentKindLabels: Record<InvestmentKindValue, string> = {
  fd: 'Fixed Deposit',
  stocks: 'Stocks',
  mutual_funds: 'Mutual Funds',
  crypto: 'Crypto Currency',
  other: 'Other',
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
  other: 'other',
};

export const normalizeInvestmentKind = (kind: string | null | undefined): InvestmentKindValue => {
  const normalized = (kind ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, '_');
  return kindAliases[normalized] ?? 'other';
};

export const isUnitBasedInvestment = (kind: InvestmentKindValue): boolean => {
  return kind === 'stocks' || kind === 'mutual_funds' || kind === 'crypto';
};

export const isLivePriceInvestment = (kind: InvestmentKindValue): boolean => {
  return kind === 'stocks' || kind === 'mutual_funds' || kind === 'crypto';
};
