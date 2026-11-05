export type FundReturnStats = {
  fund: Partial<Record<'1y' | '3y' | '5y', number | null>>;
  category: Partial<Record<'1y' | '3y' | '5y', number | null>>;
  rank: Partial<Record<'1y' | '3y' | '5y', number | null>>;
};

type FundPortfolioHolding = {
  companyName: string;
  stockRef: string | null;
  sector: string | null;
  assetType: string | null;
  instrument: string | null;
  rating: string | null;
  weightPercent: number;
  marketValueCrore: number | null;
};

export type FundPortfolio = {
  providerId: string;
  schemeName: string;
  fundHouse: string | null;
  category: string | null;
  subCategory: string | null;
  expenseRatio: number | null;
  aumCrore: number | null;
  benchmark: string | null;
  portfolioTurnover: number | null;
  returnStats: FundReturnStats;
  portfolioDate: Date | null;
  holdings: FundPortfolioHolding[];
};

export type StockProfile = {
  name: string | null;
  industry: string | null;
  marketCapCrore: number | null;
  nseSymbol: string | null;
  bseCode: string | null;
};

type ListedInstrument = { ref: string; isFund: boolean };

export type FundPortfolioProvider = {
  resolveFund: (schemeCode: string, schemeName: string) => Promise<string | null>;
  resolveListing: (symbol: string) => Promise<ListedInstrument | null>;
  fetchFund: (providerId: string) => Promise<FundPortfolio | null>;
  fetchStock: (stockRef: string) => Promise<StockProfile | null>;
};
