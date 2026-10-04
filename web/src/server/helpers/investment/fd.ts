import { MS_PER_DAY, PERCENTAGE_DIVISOR } from '@/types';

import { parseOptionalNumber } from './utils';

import type { InvestmentRow } from './types';

const DAYS_PER_YEAR = 365.25;
const YEAR_IN_MS = DAYS_PER_YEAR * MS_PER_DAY;

export const getFdValuationAtDate = (investment: InvestmentRow, valueDate: Date): number | null => {
  const principal = parseOptionalNumber(investment.investmentAmount);
  if (principal === null) {
    return null;
  }

  const maturityValue = parseOptionalNumber(investment.maturityAmount);
  const { maturityDate } = investment;
  const annualRate = parseOptionalNumber(investment.annualRate);
  const currentDate = valueDate;

  if (maturityValue !== null && maturityDate !== null) {
    if (currentDate >= maturityDate) {
      return maturityValue;
    }

    if (principal > 0) {
      const totalDuration = maturityDate.getTime() - investment.investmentDate.getTime();
      const elapsedDuration = currentDate.getTime() - investment.investmentDate.getTime();
      if (totalDuration > 0 && elapsedDuration > 0) {
        const elapsedRatio = Math.min(Math.max(elapsedDuration / totalDuration, 0), 1);
        const growthRatio = maturityValue / principal;
        if (growthRatio > 0) {
          return principal * Math.pow(growthRatio, elapsedRatio);
        }
      }
    }
  }

  if (annualRate !== null) {
    const heldYears = Math.max(
      (currentDate.getTime() - investment.investmentDate.getTime()) / YEAR_IN_MS,
      0,
    );
    return principal * Math.pow(1 + annualRate / PERCENTAGE_DIVISOR, heldYears);
  }

  return principal;
};

export const getFdValuation = (investment: InvestmentRow): number | null => {
  return getFdValuationAtDate(investment, new Date());
};
