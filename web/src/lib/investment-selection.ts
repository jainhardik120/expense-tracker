import {
  getInvestmentCategory,
  investmentCategoryValues,
  investmentKindValues,
  normalizeStockMarket,
  type InvestmentCategoryValue,
  type InvestmentKindValue,
  type StockMarketValue,
} from '@/lib/investments';

export const PORTFOLIO_VIEW = '__portfolio__';

export const lastStockPriceTime = (
  positions: Array<{
    normalizedKind: string;
    isExcludedFromPortfolioPosition: boolean;
    isClosedPosition: boolean;
    valuationDate: Date | null;
  }>,
) => {
  const times = positions.flatMap((position) =>
    position.normalizedKind === 'stocks' &&
    !position.isExcludedFromPortfolioPosition &&
    !position.isClosedPosition &&
    position.valuationDate !== null
      ? [position.valuationDate.getTime()]
      : [],
  );
  return times.length === 0 ? null : new Date(Math.max(...times));
};
const CATEGORY_VIEW_PREFIX = '__category__|';

export const toCategoryViewValue = (category: InvestmentCategoryValue) =>
  `${CATEGORY_VIEW_PREFIX}${category}`;

export const parseCategoryViewValue = (value: string): InvestmentCategoryValue | null => {
  if (!value.startsWith(CATEGORY_VIEW_PREFIX)) {
    return null;
  }
  const category = value.slice(CATEGORY_VIEW_PREFIX.length) as InvestmentCategoryValue;
  return investmentCategoryValues.includes(category) ? category : null;
};

const RSU_VIEW_SUFFIX = '+rsu';

export const toViewValue = (
  kind: InvestmentKindValue,
  code: string,
  stockMarket: StockMarketValue | null,
  isRsu = false,
) => `${kind}|${stockMarket ?? 'NA'}${isRsu ? RSU_VIEW_SUFFIX : ''}|${code}`;

export const parseViewValue = (
  value: string,
): {
  kind: InvestmentKindValue;
  code: string;
  stockMarket: StockMarketValue | null;
  isRsu: boolean;
} | null => {
  const [kind, stockMarketPart, ...codeParts] = value.split('|');
  if (codeParts.length === 0) {
    return null;
  }
  const code = codeParts.join('|');
  const isRsu = stockMarketPart.endsWith(RSU_VIEW_SUFFIX);
  const stockMarketRaw = isRsu
    ? stockMarketPart.slice(0, -RSU_VIEW_SUFFIX.length)
    : stockMarketPart;
  const normalizedStockMarket =
    stockMarketRaw === 'NA' ? null : normalizeStockMarket(stockMarketRaw);
  if (investmentKindValues.includes(kind as InvestmentKindValue)) {
    return {
      kind: kind as InvestmentKindValue,
      stockMarket: normalizedStockMarket,
      code,
      isRsu,
    };
  }
  return null;
};

export const matchesSelection = (
  row: {
    normalizedKind: InvestmentKindValue;
    normalizedStockMarket: StockMarketValue | null;
    instrumentCode: string | null;
    isRsuPosition: boolean;
  },
  { category, instrument }: { category: string[]; instrument: string[] },
) => {
  const categoryOk =
    category.length === 0 ||
    category.includes(getInvestmentCategory(row.normalizedKind, row.isRsuPosition));
  const instrumentOk =
    instrument.length === 0 ||
    instrument.includes(
      toViewValue(
        row.normalizedKind,
        row.instrumentCode?.trim() ?? '',
        row.normalizedStockMarket,
        row.isRsuPosition,
      ),
    );
  return categoryOk && instrumentOk;
};

export const matchesStatus = (
  { hasOpen, hasClosed }: { hasOpen: boolean; hasClosed: boolean },
  { status, instrument }: { status: string[]; instrument: string[] },
) => {
  if (status.length === 0) {
    return hasOpen || instrument.length > 0;
  }
  return (status.includes('open') && hasOpen) || (status.includes('closed') && hasClosed);
};
