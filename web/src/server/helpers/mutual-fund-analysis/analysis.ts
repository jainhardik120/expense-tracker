import type { FundReturnStats } from './provider';
import type { StoredFund, StoredStock } from './store';

const PERCENT = 100;
const LARGE_CAP_MIN_CRORE = 100_000;
const MID_CAP_MIN_CRORE = 33_000;
const TOP_COMPANIES = 10;
const EQUITY = 'EQUITY';
const UNSPECIFIED = 'Unspecified';

export type FundPosition = {
  schemeCode: string;
  schemeName: string;
  value: number;
  invested: number;
  xirr: number | null;
  navChange: number;
  navDate: Date | null;
};

export type CapBucket = 'Large cap' | 'Mid cap' | 'Small cap' | 'Unknown size' | 'Not equity';

type Slice = { name: string; value: number; share: number };

type CompanyFund = { schemeCode: string; weightPercent: number; value: number };

type CompanyExposure = {
  key: string;
  name: string;
  sector: string;
  industry: string | null;
  assetType: string;
  marketCapCrore: number | null;
  capBucket: CapBucket;
  value: number;
  share: number;
  funds: CompanyFund[];
};

type FundSummary = {
  schemeCode: string;
  schemeName: string;
  fundHouse: string | null;
  category: string | null;
  subCategory: string | null;
  value: number;
  invested: number;
  xirr: number | null;
  navChange: number;
  navChangePercent: number | null;
  navDate: Date | null;
  share: number;
  expenseRatio: number | null;
  yearlyCost: number | null;
  aumCrore: number | null;
  benchmark: string | null;
  portfolioTurnover: number | null;
  returnStats: FundReturnStats | null;
  portfolioDate: Date | null;
  holdingsCount: number;
  equityShare: number;
  analysed: boolean;
};

export type MutualFundAnalysis = {
  totals: {
    value: number;
    invested: number;
    analysedValue: number;
    companies: number;
    equityShare: number;
    weightedExpenseRatio: number | null;
    yearlyCost: number;
    navChange: number;
    navChangePercent: number | null;
    latestNavDate: Date | null;
    topCompaniesShare: number;
    oldestPortfolioDate: Date | null;
  };
  funds: FundSummary[];
  companies: CompanyExposure[];
  sectors: Slice[];
  assetTypes: Slice[];
  capBuckets: Slice[];
  fundHouses: Slice[];
  categories: Slice[];
  overlap: { schemeCodes: string[]; matrix: number[][] };
};

const changePercent = (value: number, change: number) =>
  value - change === 0 ? null : (change / (value - change)) * PERCENT;

const latestDate = (dates: Array<Date | null>) => {
  const times = dates.flatMap((date) => (date === null ? [] : [date.getTime()]));
  return times.length === 0 ? null : new Date(Math.max(...times));
};

export const capBucketFor = (assetType: string, marketCapCrore: number | null): CapBucket => {
  if (assetType !== EQUITY) {
    return 'Not equity';
  }
  if (marketCapCrore === null) {
    return 'Unknown size';
  }
  if (marketCapCrore >= LARGE_CAP_MIN_CRORE) {
    return 'Large cap';
  }
  return marketCapCrore >= MID_CAP_MIN_CRORE ? 'Mid cap' : 'Small cap';
};

const companyKey = (holding: StoredFund['holdings'][number]) =>
  holding.stockRef ?? `${holding.assetType ?? ''}:${holding.companyName.toLowerCase()}`;

const toSlices = (totals: Map<string, number>, base: number): Slice[] =>
  [...totals.entries()]
    .map(([name, value]) => ({ name, value, share: base === 0 ? 0 : (value / base) * PERCENT }))
    .sort((left, right) => right.value - left.value);

const addTo = (totals: Map<string, number>, key: string, value: number) => {
  totals.set(key, (totals.get(key) ?? 0) + value);
};

const longEquityWeights = (fund: StoredFund) => {
  const weights = new Map<string, number>();
  for (const holding of fund.holdings) {
    if (holding.assetType === EQUITY) {
      addTo(weights, companyKey(holding), holding.weightPercent);
    }
  }
  return weights;
};

export const fundOverlap = (left: StoredFund, right: StoredFund): number => {
  const leftWeights = longEquityWeights(left);
  let overlap = 0;
  for (const [key, weight] of longEquityWeights(right)) {
    overlap += Math.max(0, Math.min(weight, leftWeights.get(key) ?? 0));
  }
  return overlap;
};

export const analyseMutualFunds = (
  positions: FundPosition[],
  funds: Map<string, StoredFund>,
  stocks: Map<string, StoredStock>,
): MutualFundAnalysis => {
  const totalValue = positions.reduce((total, position) => total + position.value, 0);
  const totalInvested = positions.reduce((total, position) => total + position.invested, 0);
  const totalNavChange = positions.reduce((total, position) => total + position.navChange, 0);
  const companies = new Map<string, CompanyExposure>();
  const sectors = new Map<string, number>();
  const assetTypes = new Map<string, number>();
  const capBuckets = new Map<string, number>();
  const fundHouses = new Map<string, number>();
  const categories = new Map<string, number>();
  let analysedValue = 0;
  let costedValue = 0;
  let yearlyCost = 0;

  const summaries: FundSummary[] = positions
    .map((position) => {
      const fund = funds.get(position.schemeCode);
      const share = totalValue === 0 ? 0 : (position.value / totalValue) * PERCENT;
      const equityWeight =
        fund?.holdings
          .filter((holding) => holding.assetType === EQUITY)
          .reduce((total, holding) => total + holding.weightPercent, 0) ?? 0;
      const expenseRatio = fund?.expenseRatio ?? null;
      const cost = expenseRatio === null ? null : (position.value * expenseRatio) / PERCENT;
      if (cost !== null) {
        yearlyCost += cost;
        costedValue += position.value;
      }
      addTo(fundHouses, fund?.fundHouse ?? UNSPECIFIED, position.value);
      addTo(categories, fund?.subCategory ?? fund?.category ?? UNSPECIFIED, position.value);
      const analysed = fund !== undefined && fund.holdings.length > 0;
      if (analysed) {
        analysedValue += position.value;
        for (const holding of fund.holdings) {
          const value = (position.value * holding.weightPercent) / PERCENT;
          const assetType = holding.assetType ?? UNSPECIFIED;
          const stock = holding.stockRef === null ? undefined : stocks.get(holding.stockRef);
          const marketCapCrore = stock?.marketCapCrore ?? null;
          const capBucket = capBucketFor(assetType, marketCapCrore);
          const sector = holding.sector ?? UNSPECIFIED;
          addTo(sectors, assetType === EQUITY ? sector : assetType, value);
          addTo(assetTypes, assetType, value);
          addTo(capBuckets, capBucket, value);
          const key = companyKey(holding);
          const company = companies.get(key) ?? {
            key,
            name: stock?.name ?? holding.companyName,
            sector,
            industry: stock?.industry ?? null,
            assetType,
            marketCapCrore,
            capBucket,
            value: 0,
            share: 0,
            funds: [],
          };
          company.value += value;
          const existing = company.funds.find((item) => item.schemeCode === position.schemeCode);
          if (existing === undefined) {
            company.funds.push({
              schemeCode: position.schemeCode,
              weightPercent: holding.weightPercent,
              value,
            });
          } else {
            existing.weightPercent += holding.weightPercent;
            existing.value += value;
          }
          companies.set(key, company);
        }
      }
      return {
        schemeCode: position.schemeCode,
        schemeName: fund?.schemeName ?? position.schemeName,
        fundHouse: fund?.fundHouse ?? null,
        category: fund?.category ?? null,
        subCategory: fund?.subCategory ?? null,
        value: position.value,
        invested: position.invested,
        xirr: position.xirr,
        navChange: position.navChange,
        navChangePercent: changePercent(position.value, position.navChange),
        navDate: position.navDate,
        share,
        expenseRatio,
        yearlyCost: cost,
        aumCrore: fund?.aumCrore ?? null,
        benchmark: fund?.benchmark ?? null,
        portfolioTurnover: fund?.portfolioTurnover ?? null,
        returnStats: fund?.returnStats ?? null,
        portfolioDate: fund?.portfolioDate ?? null,
        holdingsCount: fund?.holdings.length ?? 0,
        equityShare: equityWeight,
        analysed,
      };
    })
    .sort((left, right) => right.value - left.value);

  const companyList = [...companies.values()]
    .map((company) => ({
      ...company,
      share: analysedValue === 0 ? 0 : (company.value / analysedValue) * PERCENT,
      funds: company.funds.toSorted((left, right) => right.value - left.value),
    }))
    .toSorted((left, right) => right.value - left.value);
  const equityValue = assetTypes.get(EQUITY) ?? 0;
  const analysedFunds = summaries.filter((summary) => summary.analysed);
  const matrix = analysedFunds.map((left) =>
    analysedFunds.map((right) => {
      const leftFund = funds.get(left.schemeCode);
      const rightFund = funds.get(right.schemeCode);
      return leftFund === undefined || rightFund === undefined
        ? 0
        : fundOverlap(leftFund, rightFund);
    }),
  );
  const dates = analysedFunds
    .map((summary) => summary.portfolioDate)
    .filter((date): date is Date => date !== null);

  return {
    totals: {
      value: totalValue,
      invested: totalInvested,
      analysedValue,
      companies: companyList.filter((company) => company.assetType === EQUITY).length,
      equityShare: analysedValue === 0 ? 0 : (equityValue / analysedValue) * PERCENT,
      weightedExpenseRatio: costedValue === 0 ? null : (yearlyCost / costedValue) * PERCENT,
      yearlyCost,
      navChange: totalNavChange,
      navChangePercent: changePercent(totalValue, totalNavChange),
      latestNavDate: latestDate(positions.map((position) => position.navDate)),
      topCompaniesShare: companyList
        .filter((company) => company.assetType === EQUITY)
        .slice(0, TOP_COMPANIES)
        .reduce((total, company) => total + company.share, 0),
      oldestPortfolioDate:
        dates.length === 0 ? null : new Date(Math.min(...dates.map((date) => date.getTime()))),
    },
    funds: summaries,
    companies: companyList,
    sectors: toSlices(sectors, analysedValue),
    assetTypes: toSlices(assetTypes, analysedValue),
    capBuckets: toSlices(capBuckets, analysedValue),
    fundHouses: toSlices(fundHouses, totalValue),
    categories: toSlices(categories, totalValue),
    overlap: { schemeCodes: analysedFunds.map((summary) => summary.schemeCode), matrix },
  };
};
