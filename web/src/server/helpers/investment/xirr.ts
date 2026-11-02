import { PERCENTAGE_DIVISOR } from '@/types';

import type { EnrichedInvestment } from './models';

export type CashFlow = { date: Date; amount: number };

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;
const MIN_SPAN_DAYS = 30;
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-7;
const LOWER_RATE = -0.9999;
const UPPER_RATE = 100;
const ROUNDING = 10_000;

const toPercentage = (rate: number) =>
  Math.round(rate * PERCENTAGE_DIVISOR * ROUNDING) / ROUNDING + 0;

const presentValue = (flows: CashFlow[], origin: number, rate: number) =>
  flows.reduce(
    (total, flow) =>
      total +
      flow.amount / (1 + rate) ** ((flow.date.getTime() - origin) / MS_PER_DAY / DAYS_PER_YEAR),
    0,
  );

export const computeXirr = (flows: CashFlow[]): number | null => {
  const usable = flows.filter((flow) => Number.isFinite(flow.amount) && flow.amount !== 0);
  if (!usable.some((flow) => flow.amount < 0) || !usable.some((flow) => flow.amount > 0)) {
    return null;
  }
  const times = usable.map((flow) => flow.date.getTime());
  const origin = Math.min(...times);
  if ((Math.max(...times) - origin) / MS_PER_DAY < MIN_SPAN_DAYS) {
    return null;
  }
  let low = LOWER_RATE;
  let high = UPPER_RATE;
  let lowValue = presentValue(usable, origin, low);
  if (lowValue * presentValue(usable, origin, high) > 0) {
    return null;
  }
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = presentValue(usable, origin, middle);
    if (Math.abs(middleValue) < TOLERANCE || high - low < TOLERANCE) {
      return toPercentage(middle);
    }
    if (lowValue * middleValue < 0) {
      high = middle;
    } else {
      low = middle;
      lowValue = middleValue;
    }
  }
  return toPercentage((low + high) / 2);
};

export const investmentCashFlows = (investment: EnrichedInvestment, asOf: Date): CashFlow[] => {
  const invested = investment.investedAmountInr;
  const valuation = investment.valuationAmount ?? invested;
  const exitDate =
    investment.isClosedPosition && investment.closedAt !== null ? investment.closedAt : asOf;
  return [
    { date: investment.investmentDate, amount: -invested },
    { date: exitDate, amount: valuation },
  ];
};
