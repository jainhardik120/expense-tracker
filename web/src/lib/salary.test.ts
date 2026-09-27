import { expect, test } from 'vitest';

import {
  buildRevisionSchedule,
  calculateIndiaNewRegimeTax,
  getEstimatedPayDate,
  getSalaryLineTotals,
  hasMaterialSalaryNetMismatch,
  reconcileSalaryTdsForecast,
} from './salary';

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

  expect(april.daysPaid).toBe(20);
  expect(april.daysInPeriod).toBe(30);
  expect(april.components[0]?.amount).toBe(20_000);
  expect(april.components[1]?.amount).toBe(1_000);
});

test('moves an estimated weekend pay date to the previous weekday', () => {
  const payDate = getEstimatedPayDate(2026, 6, 25, 'previous_weekday');
  expect(payDate.toISOString().slice(0, 10)).toBe('2026-07-24');
});

test('calculates net, deductions, and taxable salary independently', () => {
  expect(
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
  ).toStrictEqual({
    earnings: 100_000,
    deductions: 12_000,
    net: 88_000,
    taxableIncome: 98_000,
    tds: 10_000,
  });
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

  expect(rows[0]?.estimatedTds).toBe(86_200.1);
  expect(rows[0]?.reconciliation).toBe(0);
  expect(rows.slice(1).map((row) => row.reconciliation)).toStrictEqual([
    4_311.07, 4_311.07, 4_311.07, 4_311.07, 4_311.06, 4_311.06,
  ]);
  expect(rows[1]?.estimatedTds).toBe(41_491.07);
  expect(rows.at(-1)?.estimatedTds).toBe(16_011.06);
  expect(
    Math.round(rows.reduce((total, row) => total + row.estimatedTds, 60_234) * 100) / 100,
  ).toBe(267_980.5);
});

test('represents a downward TDS reconciliation as a reduced deduction', () => {
  expect(
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
  ).toStrictEqual({
    earnings: 145_833,
    deductions: 19_216.46,
    taxableIncome: 145_833,
    net: 126_616.54,
    tds: 10_266.46,
  });
});

test('ignores small salary rounding differences up to ten rupees', () => {
  expect(hasMaterialSalaryNetMismatch(124_898, 124_897.54)).toBe(false);
  expect(hasMaterialSalaryNetMismatch(100_010, 100_000)).toBe(false);
  expect(hasMaterialSalaryNetMismatch(100_010.01, 100_000)).toBe(true);
  expect(hasMaterialSalaryNetMismatch(null, 100_000)).toBe(false);
});

test('applies the new-regime rebate at twelve lakh taxable income', () => {
  const tax = calculateIndiaNewRegimeTax({ salaryTaxableIncome: 1_275_000 });
  expect(tax.taxableIncome).toBe(1_200_000);
  expect(tax.totalTax).toBe(0);
});

test('taxes bonus income at the marginal slab after regular salary', () => {
  const regular = calculateIndiaNewRegimeTax({ salaryTaxableIncome: 1_675_000 });
  const withBonus = calculateIndiaNewRegimeTax({ salaryTaxableIncome: 1_775_000 });
  expect(regular.taxableIncome).toBe(1_600_000);
  expect(regular.slabs.map(({ taxableAmount, tax }) => ({ taxableAmount, tax }))).toStrictEqual([
    { taxableAmount: 400_000, tax: 0 },
    { taxableAmount: 400_000, tax: 20_000 },
    { taxableAmount: 400_000, tax: 40_000 },
    { taxableAmount: 400_000, tax: 60_000 },
    { taxableAmount: 0, tax: 0 },
    { taxableAmount: 0, tax: 0 },
    { taxableAmount: 0, tax: 0 },
  ]);
  expect(regular.totalTax).toBe(124_800);
  expect(withBonus.totalTax - regular.totalTax).toBe(20_800);
});

test('calculates outside income as incremental tax above salary tax', () => {
  const salaryTax = calculateIndiaNewRegimeTax({ salaryTaxableIncome: 2_305_694.24 });
  const totalTax = calculateIndiaNewRegimeTax({
    salaryTaxableIncome: 2_305_694.24,
    otherTaxableIncome: 10.11,
  });

  expect(salaryTax.totalTax).toBe(267_980.5);
  expect(totalTax.totalTax).toBe(267_983.13);
  expect(Number((totalTax.totalTax - salaryTax.totalTax).toFixed(2))).toBe(2.63);
});
