import { parseOptionalNumber } from './utils';

import type { InvestmentRow } from './types';

const YEAR_IN_MS = 365.25 * 24 * 60 * 60 * 1000;

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
    return principal * Math.pow(1 + annualRate / 100, heldYears);
  }

  return principal;
};

export const getFdValuation = (investment: InvestmentRow): number | null => {
  return getFdValuationAtDate(investment, new Date());
};
