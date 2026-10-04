import { expect, test } from 'vitest';

import { cycleAllowance, project, monthsBetween } from './budget-projection';

const line = (over = {}) => ({
  lineId: 'l',
  name: 'Line',
  allocationKind: 'monthly' as const,
  allocationAmount: 1000,
  discretionary: true,
  closed: false,
  actual: 0,
  earmarkedIncome: 0,
  scheduled: { year: 0, toDate: 0, remaining: 0 },
  pacePerMonth: 0,
  ...over,
});

test('a monthly allocation budgets for the whole year, not just so far', () => {
  const { lines } = project([line({ allocationAmount: 1000 })], 0, 3, 12);
  expect(lines[0].yearBudget).toBe(12000);
});

test('what is left is paced over the months that remain', () => {
  const { lines } = project([line({ allocationAmount: 1000, actual: 6000 })], 0, 6, 12);
  expect(lines[0].remaining).toBe(6000);
  expect(lines[0].perMonthRemaining).toBe(1000);
});

test('overspending is reported rather than floored at zero', () => {
  const { lines } = project(
    [line({ allocationKind: 'annual', allocationAmount: 60000, actual: 68740 })],
    0,
    10,
    12,
  );
  expect(lines[0].remaining).toBe(-8740);
  expect(lines[0].overspent).toBe(true);
});

test('an earmarked line is funded only by the income pointed at it', () => {
  const { lines } = project(
    [
      line({
        allocationKind: 'earmarked',
        allocationAmount: 0,
        earmarkedIncome: 28948,
        actual: 32460,
      }),
    ],
    0,
    10,
    12,
  );
  expect(lines[0].yearBudget).toBe(28948);
  expect(lines[0].remaining).toBe(-3512);
});

test('income still to come is supplied by the payroll, not guessed from the past', () => {
  const p = project([line({ allocationAmount: 0 })], 1000, 10, 12, 0, -1, 0, 200);
  expect(p.expectedTotalIncome).toBe(1200);
  expect(p.remainingMonths).toBe(2);
});

test('nothing is assumed about income the payroll has not promised', () => {
  const p = project([line({ allocationAmount: 0 })], 1000, 10, 12);
  expect(p.expectedTotalIncome).toBe(1000);
});

test('the residual is whatever the lines above it leave, and shrinks when they overspend', () => {
  const thrifty = project(
    [
      line({ allocationAmount: 1000, actual: 10000 }),
      line({ lineId: 'r', allocationKind: 'residual' }),
    ],
    24000,
    10,
    12,
  );
  const spendy = project(
    [
      line({ allocationAmount: 1000, actual: 16000 }),
      line({ lineId: 'r', allocationKind: 'residual' }),
    ],
    24000,
    10,
    12,
  );
  expect(thrifty.projectedAtPace - spendy.projectedAtPace).toBe(6000);
  expect(thrifty.lines[1].yearBudget).toBe(spendy.lines[1].yearBudget);
});

test('months between dates counts part months', () => {
  expect(monthsBetween(new Date('2026-01-01'), new Date('2026-04-01'))).toBe(3);
  expect(Math.round(monthsBetween(new Date('2025-12-24'), new Date('2026-09-26')))).toBe(9);
});

test('a fixed monthly line is projected to keep costing its rate', () => {
  const { lines } = project(
    [line({ allocationAmount: 1000, actual: 10000, discretionary: false })],
    0,
    10,
    12,
  );
  expect(lines[0].forecastRemaining).toBe(2000);
  expect(lines[0].projectedSpend).toBe(12000);
  expect(lines[0].variance).toBe(0);
});

test('a discretionary line is forecast at the rate it is actually running at', () => {
  const { lines } = project(
    [line({ allocationAmount: 9300, actual: 113968, pacePerMonth: 11400 })],
    0,
    10,
    12,
  );
  expect(lines[0].yearBudget).toBe(111600);
  expect(lines[0].forecastRemaining).toBe(22800);
  expect(Math.round(lines[0].variance)).toBe(25168);
});

test('income earmarked at a line funds it rather than showing as overspend', () => {
  const { lines } = project(
    [
      line({
        allocationKind: 'earmarked',
        allocationAmount: 0,
        earmarkedIncome: 28948,
        actual: 32460,
      }),
    ],
    0,
    10,
    12,
  );
  expect(lines[0].yearBudget).toBe(28948);
  expect(lines[0].variance).toBe(3512);
});

test('an envelope topped up by earmarked income is bigger than the figure typed in', () => {
  const { lines } = project(
    [
      line({
        allocationKind: 'annual',
        allocationAmount: 60000,
        earmarkedIncome: 9579.71,
        actual: 68739.85,
      }),
    ],
    0,
    10,
    12,
  );
  expect(Math.round(lines[0].variance)).toBe(0);
});

test('spending an envelope early is not overspending it', () => {
  const { lines } = project(
    [line({ allocationKind: 'annual', allocationAmount: 60000, actual: 60000 })],
    0,
    3,
    12,
  );
  expect(lines[0].variance).toBe(0);
});

test('a schedule line is budgeted from the instalments that fall inside the year', () => {
  const { lines } = project(
    [
      line({
        allocationKind: 'schedule',
        allocationAmount: 0,
        scheduled: { year: 36900, toDate: 24903, remaining: 11997 },
        actual: 24903,
      }),
    ],
    0,
    10,
    12,
  );
  expect(lines[0].yearBudget).toBe(36900);
  expect(lines[0].projectedSpend).toBe(36900);
  expect(lines[0].variance).toBe(0);
});

test('unspent rent is saved, unspent envelope is reserved', () => {
  const { lines } = project(
    [
      line({ lineId: 'rent', allocationKind: 'monthly', allocationAmount: 22000, actual: 219000 }),
      line({ lineId: 'flights', allocationKind: 'annual', allocationAmount: 60000, actual: 37640 }),
    ],
    0,
    10,
    12,
  );
  expect(lines[0].unspentIsSaved).toBe(true);
  expect(lines[1].unspentIsSaved).toBe(false);
});

test('money invested counts as spent, not as spending undone', () => {
  const { lines } = project(
    [line({ lineId: 'inv', allocationKind: 'residual', allocationAmount: 0, actual: 209268.35 })],
    1505499.6,
    10,
    12,
  );
  expect(lines[0].remaining).toBeLessThan(lines[0].yearBudget);
  expect(Math.round(lines[0].remaining)).toBe(Math.round(lines[0].yearBudget - 209268.35));
});

test('income earmarked at a line still counts towards what the year has to spend', () => {
  const withBonus = project(
    [
      line({
        lineId: 'trip',
        allocationKind: 'earmarked',
        allocationAmount: 0,
        earmarkedIncome: 28948,
      }),
      line({ lineId: 'inv', allocationKind: 'residual', allocationAmount: 0 }),
    ],
    1200000,
    10,
    12,
    0,
    -1,
    0,
    240000,
  );
  const residual = withBonus.lines.filter((l) => l.lineId === 'inv')[0];
  expect(Math.round(residual.yearBudget)).toBe(Math.round(1200000 * 1.2));
});

test('what the year opened with is money it has to spend', () => {
  const without = project([line({ lineId: 'inv', allocationKind: 'residual' })], 120000, 10, 12);
  const carried = project(
    [line({ lineId: 'inv', allocationKind: 'residual' })],
    120000,
    10,
    12,
    9500,
  );
  expect(carried.lines[0].yearBudget - without.lines[0].yearBudget).toBe(9500);
});

test('discretionary spending follows the calendar, commitments follow the salary', () => {
  const { lines } = project(
    [
      line({ lineId: 'rent', allocationAmount: 22000, discretionary: false }),
      line({ lineId: 'food', allocationAmount: 9300, discretionary: true, pacePerMonth: 11396.85 }),
    ],
    0,
    10,
    12,
    0,
    2.8667,
  );
  expect(lines[0].forecastRemaining).toBe(44000);
  expect(Math.round(lines[1].forecastRemaining)).toBe(Math.round(11396.85 * 2.8667));
});

test('spending exactly the safe amount lands exactly on the goal', () => {
  const lines = [
    line({ lineId: 'rent', allocationAmount: 22000, discretionary: false, actual: 219000 }),
    line({
      lineId: 'food',
      allocationAmount: 9300,
      discretionary: true,
      actual: 113968.47,
      pacePerMonth: 11396.85,
    }),
    line({
      lineId: 'inv',
      allocationKind: 'residual',
      allocationAmount: 270000,
      actual: 209268.35,
    }),
  ];
  const p = project(lines, 1254583, 10, 12, 9910.87, 2.8667);

  const atSafe = project(
    lines.map((l) => (l.lineId === 'food' ? { ...l, pacePerMonth: p.safeToSpendPerMonth } : l)),
    1254583,
    10,
    12,
    9910.87,
    2.8667,
  );
  expect(Math.round(atSafe.projectedAtPace)).toBe(Math.round(p.goal));
});

test('the two readings differ by exactly the discretionary overspend', () => {
  const p = project(
    [
      line({
        lineId: 'food',
        allocationAmount: 9300,
        discretionary: true,
        actual: 100000,
        pacePerMonth: 11396.85,
      }),
      line({ lineId: 'inv', allocationKind: 'residual' }),
    ],
    1200000,
    10,
    12,
    0,
    2.8667,
  );
  const gap = (11396.85 - 9300) * 2.8667;
  expect(Math.round(p.projectedAtBudget - p.projectedAtPace)).toBe(Math.round(gap));
});

test('spending not yet written down still comes off what will be saved', () => {
  const withoutQueue = project(
    [line({ lineId: 'inv', allocationKind: 'residual' })],
    1200000,
    10,
    12,
  );
  const withQueue = project(
    [line({ lineId: 'inv', allocationKind: 'residual' })],
    1200000,
    10,
    12,
    0,
    -1,
    2994,
  );
  expect(Math.round(withoutQueue.projectedAtPace - withQueue.projectedAtPace)).toBe(2994);
  expect(withQueue.safeToSpendPerMonth).toBeLessThan(withoutQueue.safeToSpendPerMonth);
});

test('the three rates describe the same year from three choices', () => {
  const p = project(
    [
      line({
        lineId: 'food',
        allocationAmount: 9300,
        discretionary: true,
        actual: 113968.47,
        pacePerMonth: 11396.85,
      }),
      line({
        lineId: 'inv',
        allocationKind: 'residual',
        allocationAmount: 270000,
        actual: 209268.35,
      }),
    ],
    1254583,
    10,
    12,
    9910.87,
    2.8667,
  );
  expect(p.pacePerMonth).toBeCloseTo(11396.85, 2);
  expect(p.budgetPerMonth).toBe(9300);
  expect(p.projectedAtPace).toBeLessThan(p.projectedAtBudget);
  expect(Math.round(p.projectedAtBudget - p.projectedAtPace)).toBe(
    Math.round((11396.85 - 9300) * 2.8667),
  );
});

test('an envelope stops advertising money a booked instalment has already claimed', () => {
  const { lines } = project(
    [
      line({
        allocationKind: 'annual',
        allocationAmount: 60000,
        actual: 47180,
        scheduled: { year: 11717.14, toDate: 0, remaining: 11717.14 },
      }),
    ],
    0,
    9,
    12,
  );
  expect(lines[0].committed).toBeCloseTo(11717.14, 2);
  expect(lines[0].remaining).toBeCloseTo(1102.86, 2);
  expect(lines[0].overspent).toBe(false);
});

test('a line whose budget is its own schedule has nothing left over', () => {
  const { lines } = project(
    [
      line({
        allocationKind: 'schedule',
        allocationAmount: 0,
        actual: 24902.66,
        scheduled: { year: 37080.17, toDate: 24902.66, remaining: 12177.51 },
      }),
    ],
    0,
    9,
    12,
  );
  expect(lines[0].yearBudget).toBeCloseTo(37080.17, 2);
  expect(lines[0].committed).toBeCloseTo(12177.51, 2);
  expect(lines[0].remaining).toBeCloseTo(0, 2);
});

test('an envelope cannot forecast away instalments it has already signed for', () => {
  const { lines } = project(
    [
      line({
        allocationKind: 'annual',
        allocationAmount: 60000,
        actual: 55000,
        scheduled: { year: 11717.14, toDate: 0, remaining: 11717.14 },
      }),
    ],
    0,
    9,
    12,
  );
  expect(lines[0].forecastRemaining).toBeCloseTo(11717.14, 2);
  expect(lines[0].projectedSpend).toBeCloseTo(66717.14, 2);
  expect(lines[0].variance).toBeCloseTo(6717.14, 2);
});

test('closing an envelope turns its leftover from reserved into saved', () => {
  const booked = {
    allocationKind: 'annual' as const,
    allocationAmount: 60000,
    actual: 47180,
    scheduled: { year: 11717.14, toDate: 0, remaining: 11717.14 },
  };
  const open = project([line({ ...booked })], 0, 9, 12).lines[0];
  expect(open.variance).toBeCloseTo(0, 2);
  expect(open.unspentIsSaved).toBe(false);

  const closed = project([line({ ...booked, closed: true })], 0, 9, 12).lines[0];
  expect(closed.forecastRemaining).toBeCloseTo(11717.14, 2);
  expect(closed.variance).toBeCloseTo(-1102.86, 2);
  expect(closed.unspentIsSaved).toBe(true);
  expect(closed.remaining).toBeCloseTo(-closed.variance, 2);
});

test('a closed line is not forecast to carry on at the pace it was running at', () => {
  const spending = {
    allocationKind: 'monthly' as const,
    allocationAmount: 1000,
    actual: 9000,
    pacePerMonth: 1000,
  };
  expect(project([line({ ...spending })], 0, 9, 12).lines[0].forecastRemaining).toBeCloseTo(
    3000,
    2,
  );
  expect(project([line({ ...spending, closed: true })], 0, 9, 12).lines[0].forecastRemaining).toBe(
    0,
  );
});

test('a pending bonus kept out of the budget does not raise the goal', () => {
  const lines = [
    line({ lineId: 'living', allocationAmount: 1000, actual: 0 }),
    line({ lineId: 'inv', allocationKind: 'residual', allocationAmount: 0 }),
  ];
  const salaryOnly = project(lines, 100000, 10, 12, 0, -1, 0, 20000);
  const withBonus = project(lines, 100000, 10, 12, 0, -1, 0, 20000 + 7000);
  const residual = (p: ReturnType<typeof project>) =>
    p.lines.filter((l) => l.lineId === 'inv')[0].yearBudget;
  expect(residual(withBonus) - residual(salaryOnly)).toBeCloseTo(7000, 2);
});

const opening = { monthsFromCycleStart: 3, cycleMonths: 1, daysLeftInCycle: 20, daysInCycle: 30 };

test('the month figure is what it was when the cycle opened, whatever has been spent since', () => {
  const untouched = cycleAllowance({ ...opening, affordable: 30000, spent: 0 });
  const spentEarly = cycleAllowance({ ...opening, affordable: 26000, spent: 4000 });
  expect(untouched.perMonth).toBe(10000);
  expect(spentEarly.perMonth).toBe(10000);
});

test('a rupee spent this cycle takes exactly a rupee off what is left of it', () => {
  const { remaining, perDay } = cycleAllowance({ ...opening, affordable: 26000, spent: 4000 });
  expect(remaining).toBe(6000);
  expect(perDay).toBe(300);
});

test('overspending a cycle shows below zero rather than shrinking the month', () => {
  const { perMonth, remaining } = cycleAllowance({ ...opening, affordable: 18000, spent: 12000 });
  expect(perMonth).toBe(10000);
  expect(remaining).toBe(-2000);
});

test('the last cycle of the year gets everything that is left, not more', () => {
  const last = cycleAllowance({
    affordable: 5000,
    spent: 3000,
    monthsFromCycleStart: 1,
    cycleMonths: 1,
    daysLeftInCycle: 10,
    daysInCycle: 30,
  });
  expect(last.remaining).toBe(5000);
  expect(last.perDay).toBe(500);
});

test('a year ending inside a cycle hands that cycle the lot, not a month of it', () => {
  const short = cycleAllowance({
    affordable: 2000,
    spent: 1000,
    monthsFromCycleStart: 1 / 3,
    cycleMonths: 1 / 3,
    daysLeftInCycle: 4,
    daysInCycle: 10,
  });
  expect(short.allowance).toBe(3000);
  expect(short.remaining).toBe(2000);
});

test('the pace to compare against counts today as already spent in', () => {
  const { onPace } = cycleAllowance({ ...opening, affordable: 26000, spent: 4000 });
  expect(onPace).toBeCloseTo(3666.67, 2);
});

test('the daily average is over the same days as the pace it is compared with', () => {
  const { spentPerDay } = cycleAllowance({ ...opening, affordable: 26000, spent: 4400 });
  expect(spentPerDay).toBe(400);
});
