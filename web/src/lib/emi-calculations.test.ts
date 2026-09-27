import { expect, test } from 'vitest';

import { calculateSchedule } from '@/server/helpers/emi-calculations';

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

  expect(summary.monthlyEMI).toBe(3000);
  expect(round(summary.effectivePrincipal)).toBe(17188.99);
  expect(round(summary.totalInterest)).toBe(811.01);
  expect(round(summary.totalAmount)).toBe(18380.8);
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
  expect(withFee.schedule[0].installment).toBe(0);
  expect(withFee.schedule[0].emi).toBe(0);
  expect(withFee.summary.monthlyEMI).toBe(withoutFee.summary.monthlyEMI);
  expect(round(withFee.summary.monthlyEMI)).toBe(8884.88);
});

test('total EMI mode splits the total across the tenure', () => {
  const { summary } = calculateSchedule({
    calculationMode: 'totalEmi',
    totalEmiAmount: '24000',
    annualInterestRate: '16',
    tenure: '6',
  });

  expect(summary.monthlyEMI).toBe(4000);
  expect(round(summary.totalEMI)).toBe(24000);
});
