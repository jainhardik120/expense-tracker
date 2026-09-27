/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises, no-magic-numbers */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateSchedule,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from '../server/helpers/emi-calculations.ts';

const round = (value: number) => Math.round(value * 100) / 100;

test('monthly EMI is what was asked for, in EMI mode', () => {
  const { summary } = calculateSchedule({
    calculationMode: 'emi',
    emiAmount: '3000',
    annualInterestRate: '16',
    tenure: '6',
    gst: '18',
    processingFees: '199',
    processingFeesGst: '18',
  });

  assert.equal(summary.monthlyEMI, 3000);
  assert.equal(round(summary.effectivePrincipal), 17188.99);
  assert.equal(round(summary.totalInterest), 811.01);
  assert.equal(round(summary.totalAmount), 18380.8);
});

test('a processing fee does not hide the monthly EMI', () => {
  const withoutFee = calculateSchedule({
    calculationMode: 'principal',
    principal: '100000',
    annualInterestRate: '12',
    tenure: '12',
  });
  const withFee = calculateSchedule({
    calculationMode: 'principal',
    principal: '100000',
    annualInterestRate: '12',
    tenure: '12',
    processingFees: '500',
    processingFeesGst: '18',
  });

  // The fee is its own row at the head of the schedule and pays no EMI, which
  // is why reading the first row's emi used to report nothing.
  assert.equal(withFee.schedule[0].installment, 0);
  assert.equal(withFee.schedule[0].emi, 0);
  assert.equal(withFee.summary.monthlyEMI, withoutFee.summary.monthlyEMI);
  assert.equal(round(withFee.summary.monthlyEMI), 8884.88);
});

test('total EMI mode splits the total across the tenure', () => {
  const { summary } = calculateSchedule({
    calculationMode: 'totalEmi',
    totalEmiAmount: '24000',
    annualInterestRate: '16',
    tenure: '6',
  });

  assert.equal(summary.monthlyEMI, 4000);
  assert.equal(round(summary.totalEMI), 24000);
});
