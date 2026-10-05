import { describe, expect, test } from 'vitest';

import { type LedgerEntry, reconcile, type StatementEntry } from './match';

const period = { start: '2026-03-01', end: '2026-03-31' };

const statementRows = (
  rows: Array<[string, number, 'debit' | 'credit', string, StatementEntry['emi']?]>,
): StatementEntry[] =>
  rows.map(([date, amount, direction, description, emi], index) => ({
    index,
    date,
    amount,
    direction,
    description,
    emi: emi ?? null,
  }));

const ledgerRows = (rows: Array<[string, string, number, 'debit' | 'credit']>): LedgerEntry[] =>
  rows.map(([key, date, amount, direction]) => ({ key, date, amount, direction, label: key }));

describe('reconcile', () => {
  test('matches exact rows and a ledger row that clubs several statement rows', () => {
    const result = reconcile({
      period,
      statement: statementRows([
        ['2026-03-02', 45_000, 'debit', 'SWIGGY'],
        ['2026-03-05', 7000, 'debit', 'UPI CHAI'],
        ['2026-03-05', 8000, 'debit', 'UPI SNACKS'],
        ['2026-03-06', 12_000, 'debit', 'UPI LUNCH'],
      ]),
      ledger: ledgerRows([
        ['food', '2026-03-02', 45_000, 'debit'],
        ['week', '2026-03-06', 27_000, 'debit'],
      ]),
    });
    expect(
      result.groups.map((group) => group.kind).sort((left, right) => left.localeCompare(right)),
    ).toEqual(['exact', 'ledger_club']);
    expect(result.suggestions).toEqual([]);
    expect(result.residual).toBe(0);
  });

  test('joins a payment the ledger split across days', () => {
    const result = reconcile({
      period,
      statement: statementRows([['2026-03-18', 160_600, 'credit', 'PAYMENT RECEIVED']]),
      ledger: ledgerRows([
        ['first', '2026-03-07', 22_500, 'credit'],
        ['second', '2026-03-18', 138_100, 'credit'],
      ]),
    });
    expect(result.groups).toEqual([
      { kind: 'window', statement: [0], ledger: ['first', 'second'], difference: 0 },
    ]);
    expect(result.suggestions).toEqual([]);
  });

  test('suggests the exact amount when a row is off by a little', () => {
    const result = reconcile({
      period,
      statement: statementRows([['2026-03-14', 25_295, 'debit', 'PETROL PUMP']]),
      ledger: ledgerRows([['petrol', '2026-03-14', 25_000, 'debit']]),
    });
    expect(result.suggestions).toEqual([
      { type: 'adjust', ledger: 'petrol', from: 25_000, to: 25_295, group: 0 },
    ]);
    expect(result.residual).toBe(0);
  });

  test('folds a tiny fee into the row it was charged with', () => {
    const result = reconcile({
      period,
      statement: statementRows([
        ['2026-03-05', 60_000, 'debit', 'UPI FUEL STATION'],
        ['2026-03-05', 35, 'debit', 'UPI Fuel Surcharge'],
      ]),
      ledger: ledgerRows([['fuel', '2026-03-05', 60_000, 'debit']]),
    });
    expect(result.suggestions).toEqual([{ type: 'add', statement: 1, foldInto: 'fuel' }]);
    expect(result.residual).toBe(0);
  });

  test('settles EMI rounding to the paise and offers to move rows dated after the period', () => {
    const result = reconcile({
      period,
      statement: statementRows([
        ['2026-03-31', 51_705, 'debit', 'FP EMI 02/09', 'installment'],
        ['2026-03-31', 345_178, 'debit', 'FP EMI 01/06', 'installment'],
        ['2026-03-31', 7494, 'debit', 'IGST DB @ 18.00%'],
      ]),
      ledger: ledgerRows([
        ['emi-a', '2026-04-01', 52_555, 'debit'],
        ['emi-b', '2026-04-01', 351_845, 'debit'],
      ]),
    });
    expect(result.groups.map((group) => group.kind)).toEqual(['emi_rounding']);
    expect(result.suggestions).toEqual([
      { type: 'adjust', ledger: 'emi-b', from: 351_845, to: 351_822, group: 0 },
      { type: 'redate', ledger: 'emi-a', from: '2026-04-01', to: '2026-03-31', group: 0 },
      { type: 'redate', ledger: 'emi-b', from: '2026-04-01', to: '2026-03-31', group: 0 },
    ]);
    expect(result.residual).toBe(0);
  });

  test('cancels an EMI conversion against its purchase and keeps the paise left over', () => {
    const result = reconcile({
      period,
      statement: statementRows([
        ['2026-03-20', 436_700, 'debit', 'CLEARTRIP (Pay in EMIs)'],
        ['2026-03-22', 436_665, 'credit', 'TRANSFER TO MERCHANT EMI', 'conversion'],
      ]),
      ledger: [],
    });
    expect(result.suggestions).toEqual([
      { type: 'add_difference', amount: 35, direction: 'debit', date: '2026-03-22', group: 0 },
    ]);
    expect(result.residual).toBe(0);
  });

  test('lists missing statement rows and ledger rows the bank never charged', () => {
    const result = reconcile({
      period,
      statement: statementRows([
        ['2026-03-10', 49_900, 'debit', 'ANNUAL FEE'],
        ['2026-03-12', 1500, 'debit', 'UPI TEA'],
      ]),
      ledger: ledgerRows([
        ['tea', '2026-03-12', 1500, 'debit'],
        ['cash', '2026-03-20', 20_000, 'debit'],
        ['next-month', '2026-04-06', 30_000, 'debit'],
      ]),
    });
    expect(result.suggestions).toEqual([
      { type: 'add', statement: 0, foldInto: null },
      { type: 'not_on_statement', ledger: 'cash' },
    ]);
    expect(result.residual).toBe(0);
  });
});
