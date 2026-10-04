import { describe, expect, it } from 'vitest';

import { cycleKeyFor, spentOnDiscretionary, type BudgetLineRow } from './budget';

const line = (
  name: string,
  allocationKind: BudgetLineRow['allocationKind'],
  discretionary: boolean,
): BudgetLineRow => ({ name, allocationKind, discretionary }) as BudgetLineRow;

describe('cycleKeyFor', () => {
  it('puts a day before the cycle day in the cycle that opened last month', () => {
    expect(cycleKeyFor(new Date('2026-09-23T00:00:00Z'), 24)).toBe('2026-08');
    expect(cycleKeyFor(new Date('2026-09-24T00:00:00Z'), 24)).toBe('2026-09');
  });

  it('carries back over a year boundary', () => {
    expect(cycleKeyFor(new Date('2026-01-03T00:00:00Z'), 24)).toBe('2025-12');
  });
});

describe('spentOnDiscretionary', () => {
  const lines = [
    line('Rent', 'monthly', false),
    line('Living', 'monthly', true),
    line('Flights', 'annual', true),
    line('Gifts', 'earmarked', true),
    line('Gym', 'schedule', true),
    line('Investment', 'residual', false),
  ];

  const cycle = {
    cycle: '2026-09',
    perLine: { Rent: 22_000, Living: 4_000, Flights: 9_540, Gifts: 1_200, Gym: 1_297 },
    total: 38_037,
  };

  it('counts only the lines the monthly allowance was solved for', () => {
    expect(spentOnDiscretionary(cycle, lines)).toBe(4_000);
  });

  it('leaves a month untouched when nothing monthly was spent in it', () => {
    const noLiving = { ...cycle, perLine: { Flights: 9_540, Gym: 1_297 } };
    expect(spentOnDiscretionary(noLiving, lines)).toBe(0);
  });

  it('is zero for a cycle with nothing in it', () => {
    expect(spentOnDiscretionary(undefined, lines)).toBe(0);
  });
});
