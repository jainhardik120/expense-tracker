import {
  normalizeInvestmentKind,
  normalizeStockMarket,
  type StockMarketValue,
} from '@/lib/investments';
import { parseFloatSafe } from '@/server/helpers/emi-calculations';

import type { InvestmentRow } from './types';

export const parseOptionalNumber = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = parseFloatSafe(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getPercentageChange = (numerator: number, denominator: number): number | null => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return (numerator / Math.abs(denominator)) * 100;
};

export const getDayChangePercentageFromValuation = (
  valuationAmount: number,
  dayChange: number,
): number | null => {
  return getPercentageChange(dayChange, valuationAmount - dayChange);
};

export const deriveUnits = ({ units }: { units: string | null | undefined }): number | null => {
  const parsedUnits = parseOptionalNumber(units);
  if (parsedUnits !== null && parsedUnits > 0) {
    return parsedUnits;
  }

  return null;
};

export const getStockMarketFromInvestment = (
  investment: Pick<InvestmentRow, 'investmentKind' | 'stockMarket'>,
): StockMarketValue | null => {
  if (normalizeInvestmentKind(investment.investmentKind) !== 'stocks') {
    return null;
  }
  return normalizeStockMarket(investment.stockMarket);
};

export const isRsuInvestment = (
  investment: Pick<InvestmentRow, 'investmentKind' | 'isRsu'>,
): boolean => {
  return normalizeInvestmentKind(investment.investmentKind) === 'stocks' && investment.isRsu;
};

export const dateToDayKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
