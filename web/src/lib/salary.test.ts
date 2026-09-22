/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises, no-magic-numbers */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRevisionSchedule,
  calculateIndiaNewRegimeTax,
  getEstimatedPayDate,
  getSalaryLineTotals,
  hasMaterialSalaryNetMismatch,
  reconcileSalaryTdsForecast,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './salary.ts';

test('prorates only proratable components across a partial first month', () => {
  const [april] = buildRevisionSchedule(
    {
      revisionId: 'revision',
      revisionName: 'Joining salary',
      effectiveFrom: new Date(Date.UTC(2026, 3, 11, 12)),
      effectiveUntil: new Date(Date.UTC(2026, 4, 1, 12)),
      payDay: 25,
      payDateRule: 'previous_weekday',
      components: [
        {
          componentId: 'basic',
          name: 'Basic',
          kind: 'earning',
          classification: 'regular',
          amount: 30_000,
          affectsTaxableIncome: true,
          proratable: true,
        },
        {
          componentId: 'allowance',
          name: 'Joining allowance',
          kind: 'earning',
          classification: 'other',
          amount: 1_000,
          affectsTaxableIncome: true,
          proratable: false,
        },
      ],
    },
    2026,
  );

  assert.equal(april.daysPaid, 20);
  assert.equal(april.daysInPeriod, 30);
  assert.equal(april.components[0]?.amount, 20_000);
  assert.equal(april.components[1]?.amount, 1_000);
});

test('moves an estimated weekend pay date to the previous weekday', () => {
  const payDate = getEstimatedPayDate(2026, 6, 25, 'previous_weekday');
  assert.equal(payDate.toISOString().slice(0, 10), '2026-07-24');
});

test('calculates net, deductions, and taxable salary independently', () => {
  assert.deepEqual(
    getSalaryLineTotals([
      {
        kind: 'earning',
        classification: 'regular',
        amount: 100_000,
        affectsTaxableIncome: true,
      },
      {
        kind: 'deduction',
        classification: 'tax_withholding',
        amount: 10_000,
        affectsTaxableIncome: false,
      },
      {
        kind: 'deduction',
        classification: 'other',
        amount: 2_000,
        affectsTaxableIncome: true,
      },
    ]),
    {
      earnings: 100_000,
      deductions: 12_000,
      net: 88_000,
      taxableIncome: 98_000,
      tds: 10_000,
    },
  );
});

test('adds bonus TDS in its month and spreads the tax balance across eligible months', () => {
  const rows = reconcileSalaryTdsForecast({
    annualTax: 267_980.5,
    actualTds: 60_234,
    rows: [
      {
        key: 'september',
        baseTds: 11_700,
        bonusTds: 74_500.1,
        reconciliationEligible: false,
      },
      { key: 'october', baseTds: 11_700, bonusTds: 25_480, reconciliationEligible: true },
      { key: 'november', baseTds: 11_700, bonusTds: 0, reconciliationEligible: true },
      { key: 'december', baseTds: 11_700, bonusTds: 0, reconciliationEligible: true },
      { key: 'january', baseTds: 11_700, bonusTds: 0, reconciliationEligible: true },
      { key: 'february', baseTds: 11_700, bonusTds: 0, reconciliationEligible: true },
      { key: 'march', baseTds: 11_700, bonusTds: 0, reconciliationEligible: true },
    ],
  });

  assert.equal(rows[0]?.estimatedTds, 86_200.1);
  assert.equal(rows[0]?.reconciliation, 0);
  assert.deepEqual(
    rows.slice(1).map((row) => row.reconciliation),
    [4_311.07, 4_311.07, 4_311.07, 4_311.07, 4_311.06, 4_311.06],
  );
  assert.equal(rows[1]?.estimatedTds, 41_491.07);
  assert.equal(rows.at(-1)?.estimatedTds, 16_011.06);
  assert.equal(
    Math.round(rows.reduce((total, row) => total + row.estimatedTds, 60_234) * 100) / 100,
    267_980.5,
  );
});

test('represents a downward TDS reconciliation as a reduced deduction', () => {
  assert.deepEqual(
    getSalaryLineTotals([
      {
        kind: 'earning',
        classification: 'regular',
        amount: 145_833,
        affectsTaxableIncome: true,
      },
      {
        kind: 'deduction',
        classification: 'provident_fund',
        amount: 8_950,
        affectsTaxableIncome: false,
      },
      {
        kind: 'deduction',
        classification: 'tax_withholding',
        amount: 11_700,
        affectsTaxableIncome: false,
      },
      {
        kind: 'deduction',
        classification: 'tax_withholding',
        amount: -1_433.54,
        affectsTaxableIncome: false,
      },
    ]),
    {
      earnings: 145_833,
      deductions: 19_216.46,
      taxableIncome: 145_833,
      net: 126_616.54,
      tds: 10_266.46,
    },
  );
});

test('ignores small salary rounding differences up to ten rupees', () => {
  assert.equal(hasMaterialSalaryNetMismatch(124_898, 124_897.54), false);
  assert.equal(hasMaterialSalaryNetMismatch(100_010, 100_000), false);
  assert.equal(hasMaterialSalaryNetMismatch(100_010.01, 100_000), true);
  assert.equal(hasMaterialSalaryNetMismatch(null, 100_000), false);
});

test('applies the new-regime rebate at twelve lakh taxable income', () => {
  const tax = calculateIndiaNewRegimeTax({ salaryTaxableIncome: 1_275_000 });
  assert.equal(tax.taxableIncome, 1_200_000);
  assert.equal(tax.totalTax, 0);
});

test('taxes bonus income at the marginal slab after regular salary', () => {
  const regular = calculateIndiaNewRegimeTax({ salaryTaxableIncome: 1_675_000 });
  const withBonus = calculateIndiaNewRegimeTax({ salaryTaxableIncome: 1_775_000 });
  assert.equal(regular.taxableIncome, 1_600_000);
  assert.deepEqual(
    regular.slabs.map(({ taxableAmount, tax }) => ({ taxableAmount, tax })),
    [
      { taxableAmount: 400_000, tax: 0 },
      { taxableAmount: 400_000, tax: 20_000 },
      { taxableAmount: 400_000, tax: 40_000 },
      { taxableAmount: 400_000, tax: 60_000 },
      { taxableAmount: 0, tax: 0 },
      { taxableAmount: 0, tax: 0 },
      { taxableAmount: 0, tax: 0 },
    ],
  );
  assert.equal(regular.totalTax, 124_800);
  assert.equal(withBonus.totalTax - regular.totalTax, 20_800);
});

test('calculates outside income as incremental tax above salary tax', () => {
  const salaryTax = calculateIndiaNewRegimeTax({ salaryTaxableIncome: 2_305_694.24 });
  const totalTax = calculateIndiaNewRegimeTax({
    salaryTaxableIncome: 2_305_694.24,
    otherTaxableIncome: 10.11,
  });

  assert.equal(salaryTax.totalTax, 267_980.5);
  assert.equal(totalTax.totalTax, 267_983.13);
  assert.equal(Number((totalTax.totalTax - salaryTax.totalTax).toFixed(2)), 2.63);
});
