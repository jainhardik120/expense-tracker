import { computeXirr, type CashFlow } from '@/server/helpers/investment/xirr';

export type BenchmarkLot = {
  schemeCode: string;
  date: Date;
  amount: number;
};

export type BenchmarkPoint = { date: Date; price: number };

export type BenchmarkComparison = {
  invested: number;
  indexValue: number;
  indexXirr: number | null;
};

const navOn = (history: BenchmarkPoint[], date: Date): number | null => {
  const time = date.getTime();
  let chosen: BenchmarkPoint | null = null;
  for (const point of history) {
    if (point.date.getTime() <= time) {
      chosen = point;
    } else {
      return chosen?.price ?? point.price;
    }
  }
  return chosen?.price ?? null;
};

const compare = (lots: BenchmarkLot[], history: BenchmarkPoint[], latestNav: number, asOf: Date) => {
  let invested = 0;
  let units = 0;
  const flows: CashFlow[] = [];
  for (const lot of lots) {
    const nav = navOn(history, lot.date);
    if (nav === null || nav <= 0) {
      continue;
    }
    invested += lot.amount;
    units += lot.amount / nav;
    flows.push({ date: lot.date, amount: -lot.amount });
  }
  const indexValue = units * latestNav;
  flows.push({ date: asOf, amount: indexValue });
  return { invested, indexValue, indexXirr: computeXirr(flows) };
};

export const compareWithBenchmark = (
  lots: BenchmarkLot[],
  history: BenchmarkPoint[],
  latestNav: number,
  asOf: Date,
): { total: BenchmarkComparison; byFund: Map<string, BenchmarkComparison> } => {
  const sorted = history.toSorted((left, right) => left.date.getTime() - right.date.getTime());
  const byScheme = new Map<string, BenchmarkLot[]>();
  for (const lot of lots) {
    byScheme.set(lot.schemeCode, [...(byScheme.get(lot.schemeCode) ?? []), lot]);
  }
  return {
    total: compare(lots, sorted, latestNav, asOf),
    byFund: new Map(
      [...byScheme.entries()].map(([schemeCode, schemeLots]) => [
        schemeCode,
        compare(schemeLots, sorted, latestNav, asOf),
      ]),
    ),
  };
};

export type TimelineLot = BenchmarkLot & { units: number | null };

export type BenchmarkTimelinePoint = {
  date: Date;
  invested: number;
  value: number;
  indexValue: number;
};

export const benchmarkTimeline = (
  lots: TimelineLot[],
  fundHistories: Map<string, BenchmarkPoint[]>,
  indexHistory: BenchmarkPoint[],
): BenchmarkTimelinePoint[] => {
  const index = indexHistory.toSorted((left, right) => left.date.getTime() - right.date.getTime());
  const funds = new Map(
    [...fundHistories.entries()].map(([code, points]) => [
      code,
      points.toSorted((left, right) => left.date.getTime() - right.date.getTime()),
    ]),
  );
  const priced = lots.flatMap((lot) => {
    const history = funds.get(lot.schemeCode) ?? [];
    const indexNav = navOn(index, lot.date);
    const fundNav = navOn(history, lot.date);
    const units = lot.units ?? (fundNav === null ? null : lot.amount / fundNav);
    return indexNav === null || units === null
      ? []
      : [{ ...lot, units, indexUnits: lot.amount / indexNav, history }];
  });
  if (priced.length === 0) {
    return [];
  }
  const firstBuy = Math.min(...priced.map((lot) => lot.date.getTime()));
  return index
    .filter((point) => point.date.getTime() >= firstBuy)
    .map((point) => {
      let invested = 0;
      let value = 0;
      let indexValue = 0;
      for (const lot of priced) {
        if (lot.date.getTime() > point.date.getTime()) {
          continue;
        }
        invested += lot.amount;
        value += lot.units * (navOn(lot.history, point.date) ?? 0);
        indexValue += lot.indexUnits * point.price;
      }
      return { date: point.date, invested, value, indexValue };
    });
};
