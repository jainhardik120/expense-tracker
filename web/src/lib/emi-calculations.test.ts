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

test('an instalment keeps the time of day it was taken out at', () => {
  // Stored as the instant behind "30 Sep, IST". Read back through local date
  // parts on a UTC server this came out as midnight on the 29th -- a day early
  // -- while the processing fee, which is used as given, stayed on the 30th.
  // One loan then appeared twice in a month, on two different dates.
  const first = new Date('2026-09-29T18:30:00Z');
  const { schedule } = calculateSchedule({
    calculationMode: 'principal',
    principal: '9724.69',
    annualInterestRate: '15.99',
    tenure: '3',
    gst: '18',
    processingFees: '290.77',
    processingFeesGst: '18',
    firstInstallmentDate: first,
    processingFeesDate: first,
  });

  const fee = schedule.find((row) => row.installment === 0);
  const firstInstalment = schedule.find((row) => row.installment === 1);
  expect(fee?.date?.toISOString()).toBe(first.toISOString());
  expect(firstInstalment?.date?.toISOString()).toBe(first.toISOString());

  expect(schedule.find((row) => row.installment === 2)?.date?.toISOString()).toBe(
    '2026-10-29T18:30:00.000Z',
  );
});

test('a month-end instalment stays at a month end', () => {
  // The 31st plus a month is the 28th of a short month, not the 3rd of the one
  // after it, which is where a date built from raw parts rolls over to.
  const { schedule } = calculateSchedule({
    calculationMode: 'principal',
    principal: '12000',
    annualInterestRate: '12',
    tenure: '2',
    firstInstallmentDate: new Date('2027-01-31T06:00:00Z'),
  });

  expect(schedule.find((row) => row.installment === 2)?.date?.toISOString()).toBe(
    '2027-02-28T06:00:00.000Z',
  );
});
