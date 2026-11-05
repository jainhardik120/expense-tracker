import type { FundPortfolio } from './provider';

const CRORE_SUFFIX = /cr$/i;
const PAGE_DATA_PATTERN = /<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/;

type EtfPageData = {
  etfData?: { header?: { displayName?: string | null; searchId?: string | null } };
  etfInfoData?: { amc?: string | null; category?: string | null; benchmarkIndex?: string | null };
  etfHoldingsData?: {
    holdings?: Array<{ isin?: string | null; holdingSharePercentage?: number | null }>;
  };
  companyHeadersByIsin?: Record<string, { displayName?: string | null; searchId?: string | null }>;
};

export const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseCroreValue = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const digits = value.replaceAll(/[₹,\s]/g, '').replace(CRORE_SUFFIX, '');
  return toNumber(digits);
};

export const parseEtfPage = (html: string): FundPortfolio | null => {
  const json = PAGE_DATA_PATTERN.exec(html)?.[1];
  if (json === undefined) {
    return null;
  }
  const data = (JSON.parse(json) as { props?: { pageProps?: EtfPageData } }).props?.pageProps;
  const header = data?.etfData?.header;
  if (header?.searchId === undefined || header.searchId === null) {
    return null;
  }
  const companies = new Map(Object.entries(data?.companyHeadersByIsin ?? {}));
  const assetType = data?.etfInfoData?.category ?? null;
  return {
    providerId: header.searchId,
    schemeName: header.displayName ?? header.searchId,
    fundHouse: data?.etfInfoData?.amc ?? null,
    category: assetType,
    subCategory: null,
    expenseRatio: null,
    aumCrore: null,
    benchmark: data?.etfInfoData?.benchmarkIndex ?? null,
    portfolioTurnover: null,
    returnStats: { fund: {}, category: {}, rank: {} },
    portfolioDate: null,
    holdings: (data?.etfHoldingsData?.holdings ?? []).flatMap((holding) => {
      const weight = toNumber(holding.holdingSharePercentage);
      const isin = holding.isin ?? '';
      if (weight === null || isin === '') {
        return [];
      }
      return [
        {
          companyName: companies.get(isin)?.displayName ?? isin,
          stockRef: companies.get(isin)?.searchId ?? null,
          sector: null,
          assetType,
          instrument: null,
          rating: null,
          weightPercent: weight,
          marketValueCrore: null,
        },
      ];
    }),
  };
};
