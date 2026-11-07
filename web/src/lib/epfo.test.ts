import { describe, expect, it } from 'vitest';

import {
  getEpfoAnnualRate,
  getEpfoDueMonth,
  getEpfoInterest,
  getEpfoInterestByYear,
  getEpfoInterestFactors,
} from './epfo';

const due = (year: number, month: number) => new Date(Date.UTC(year, month - 1, 1, 12));

const contributions = [
  { amount: 11_932, dueMonth: due(2025, 10) },
  { amount: 17_500, dueMonth: due(2025, 11) },
  { amount: 17_500, dueMonth: due(2025, 12) },
  { amount: 17_500, dueMonth: due(2026, 1) },
  { amount: 17_500, dueMonth: due(2026, 2) },
  { amount: 17_500, dueMonth: due(2026, 3) },
];

const yearEnd = new Date(Date.UTC(2026, 3, 1));

describe('getEpfoInterest', () => {
  it('reproduces the monthly running balance interest for a year', () => {
    const total = contributions.reduce(
      (sum, contribution) => sum + getEpfoInterest(contribution, {}, yearEnd).estimated,
      0,
    );
    expect(total).toBeCloseTo(1613.2875, 4);
  });

  it('earns nothing in the due month itself', () => {
    const interest = getEpfoInterest(
      { amount: 17_500, dueMonth: due(2026, 3) },
      {},
      new Date(Date.UTC(2026, 2, 31)),
    );
    expect(interest.estimated).toBe(0);
  });

  it('accrues part of a month up to the given day', () => {
    const interest = getEpfoInterest(
      { amount: 12_000, dueMonth: due(2026, 5) },
      {},
      new Date(Date.UTC(2026, 5, 16)),
    );
    expect(interest.estimated).toBeCloseTo(12_000 * 0.0825 * (15 / 30 / 12), 6);
  });

  it('compounds a finished year into the next one', () => {
    const [first, second] = getEpfoInterestByYear(
      { amount: 12_000, dueMonth: due(2025, 3) },
      {},
      new Date(Date.UTC(2027, 3, 1)),
    );
    expect(first.amount).toBeCloseTo(990, 6);
    expect(second.amount).toBeCloseTo(12_990 * 0.0825, 6);
  });
});

describe('getEpfoInterestFactors', () => {
  it('splits a credited year so every contribution adds up to the credit', () => {
    const factors = getEpfoInterestFactors(contributions, [
      { financialYearStart: 2025, amount: 1614 },
    ]);
    const total = contributions.reduce(
      (sum, contribution) => sum + getEpfoInterest(contribution, factors, yearEnd).credited,
      0,
    );
    expect(total).toBeCloseTo(1614, 6);
  });

  it('keeps later years as estimates', () => {
    const factors = getEpfoInterestFactors(contributions, [
      { financialYearStart: 2025, amount: 1614 },
    ]);
    const interest = getEpfoInterest(
      contributions[0] ?? { amount: 0, dueMonth: due(2025, 10) },
      factors,
      new Date(Date.UTC(2026, 4, 1)),
    );
    expect(interest.credited).toBeGreaterThan(0);
    expect(interest.estimated).toBeGreaterThan(0);
  });

  it('ignores a credit for a year with no contributions', () => {
    expect(
      getEpfoInterestFactors(contributions, [{ financialYearStart: 2020, amount: 500 }]),
    ).toEqual({});
  });
});

describe('getEpfoDueMonth', () => {
  it('falls in the month after the salary period', () => {
    expect(getEpfoDueMonth(due(2025, 12)).toISOString().slice(0, 7)).toBe('2026-01');
  });
});

describe('getEpfoAnnualRate', () => {
  it('uses the latest declared rate until a new one exists', () => {
    expect(getEpfoAnnualRate(2030)).toBe(getEpfoAnnualRate(2025));
  });
});
