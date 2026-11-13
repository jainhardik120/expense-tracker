import { describe, expect, it } from 'vitest';

import {
  accrueInterest,
  addMonths,
  buildInterestRows,
  createBalanceLookup,
  nextPeriod,
  previousPeriod,
  rateOn,
} from './interest';

describe('interest periods', () => {
  it('clamps month ends when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-30', -3)).toBe('2025-12-30');
  });

  it('steps calendar, PNB and SBI style quarters', () => {
    expect(nextPeriod({ start: '2026-04-01', end: '2026-06-30' })).toEqual({
      start: '2026-07-01',
      end: '2026-09-30',
    });
    expect(nextPeriod({ start: '2026-03-01', end: '2026-05-31' })).toEqual({
      start: '2026-06-01',
      end: '2026-08-31',
    });
    expect(nextPeriod({ start: '2026-03-26', end: '2026-06-25' })).toEqual({
      start: '2026-06-26',
      end: '2026-09-25',
    });
    expect(previousPeriod({ start: '2025-03-01', end: '2025-05-31' })).toEqual({
      start: '2024-12-01',
      end: '2025-02-28',
    });
  });

  it('uses the latest rate in effect on each day', () => {
    const rates = [
      { effectiveFrom: '2025-06-15', annualRate: 2.5 },
      { effectiveFrom: '2020-06-01', annualRate: 2.7 },
    ];
    expect(rateOn(rates, '2025-06-14')).toBeCloseTo(2.7);
    expect(rateOn(rates, '2025-06-15')).toBeCloseTo(2.5);
    expect(rateOn(rates, '2019-01-01')).toBeNull();
  });
});

describe('accrueInterest', () => {
  it('sums daily closing balances at the rate in effect', () => {
    const balanceOn = createBalanceLookup(0, [
      { day: '2026-01-01', amount: 36_500 },
      { day: '2026-01-11', amount: -36_500 },
    ]);
    const result = accrueInterest({ start: '2026-01-01', end: '2026-01-31' }, balanceOn, [
      { effectiveFrom: '2025-01-01', annualRate: 2.5 },
    ]);
    expect(result?.interest).toBeCloseTo(25, 6);
  });

  it('leaves out the credit itself when it lands inside the period', () => {
    const balanceOn = createBalanceLookup(36_500, [{ day: '2026-03-31', amount: 103 }]);
    const result = accrueInterest(
      { start: '2026-03-31', end: '2026-03-31' },
      balanceOn,
      [{ effectiveFrom: '2025-01-01', annualRate: 1 }],
      { day: '2026-03-31', amount: 103 },
    );
    expect(result?.interest).toBeCloseTo(1, 6);
  });

  it('returns null when no rate covers a day', () => {
    expect(accrueInterest({ start: '2026-01-01', end: '2026-01-02' }, () => 1000, [])).toBeNull();
  });
});

describe('buildInterestRows', () => {
  const rates = [{ effectiveFrom: '2025-01-01', annualRate: 2.5 }];
  const balanceOn = () => 36_500;

  it('flags a skipped quarter and projects the current one', () => {
    const rows = buildInterestRows({
      credits: [
        {
          statementId: 'a',
          creditedOn: '2026-04-01',
          amount: 225,
          taxableAmount: null,
          period: { start: '2026-01-01', end: '2026-03-31' },
        },
      ],
      rates,
      balanceOn,
      today: '2026-11-13',
    });
    expect(rows.map((row) => [row.status, row.period.start])).toEqual([
      ['current', '2026-10-01'],
      ['missing', '2026-07-01'],
      ['missing', '2026-04-01'],
      ['credited', '2026-01-01'],
    ]);
    expect(rows[0]?.expected).toBeCloseTo(230, 6);
  });

  it('guesses earlier quarters by stepping back from a confirmed one', () => {
    const rows = buildInterestRows({
      credits: [
        {
          statementId: 'old',
          creditedOn: '2025-03-09',
          amount: 225,
          taxableAmount: null,
          period: null,
        },
        {
          statementId: 'new',
          creditedOn: '2025-06-06',
          amount: 230,
          taxableAmount: null,
          period: { start: '2025-03-01', end: '2025-05-31' },
        },
      ],
      rates,
      balanceOn,
      today: '2025-06-10',
    });
    const guessed = rows.find((row) => row.statementId === 'old');
    expect(guessed?.status).toBe('unconfirmed');
    expect(guessed?.period).toEqual({ start: '2024-12-01', end: '2025-02-28' });
  });
});
