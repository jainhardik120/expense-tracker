const MONTHS_PER_YEAR = 12;
const DAYS_PER_MONTH = 30;

export type LineForProjection = {
  lineId: string;
  name: string;
  allocationKind: 'monthly' | 'annual' | 'residual' | 'earmarked' | 'schedule';
  closed: boolean;
  allocationAmount: number;
  discretionary: boolean;
  actual: number;
  earmarkedIncome: number;
  scheduled: { year: number; toDate: number; remaining: number };
  pacePerMonth: number;
};

type ProjectedLine = LineForProjection & {
  varianceAtBudget: number;
  forecastRemaining: number;
  projectedSpend: number;
  unspentIsSaved: boolean;
  yearBudget: number;
  variance: number;
  committed: number;
  remaining: number;
  perMonthRemaining: number;
  overspent: boolean;
};

export type Projection = {
  elapsedMonths: number;
  remainingMonths: number;
  spendMonths: number;
  totalMonths: number;
  incomeToDate: number;
  expectedTotalIncome: number;
  lines: ProjectedLine[];
  projectedAtPace: number;
  projectedAtBudget: number;
  goal: number;
  investedSoFar: number;
  commitmentsRemaining: number;
  discretionaryRemaining: number;
  unrecordedSpend: number;
  pacePerMonth: number;
  budgetPerMonth: number;
  safeToSpendPerMonth: number;
  affordable: number;
};

export const monthsBetween = (from: Date, to: Date): number => {
  const whole =
    (to.getFullYear() - from.getFullYear()) * MONTHS_PER_YEAR + (to.getMonth() - from.getMonth());
  const dayFraction = (to.getDate() - from.getDate()) / DAYS_PER_MONTH;
  return Math.max(whole + dayFraction, 0);
};

export const project = (
  lines: LineForProjection[],
  incomeToDate: number,
  elapsedMonths: number,
  totalMonths: number,
  openingBalance = 0,
  spendMonthsRemaining = -1,
  unrecordedSpend = 0,
  expectedFurtherIncome = 0,
): Projection => {
  const remainingMonths = Math.max(totalMonths - elapsedMonths, 0);
  const spendMonths = spendMonthsRemaining < 0 ? remainingMonths : spendMonthsRemaining;
  const earmarkedIncome = lines.reduce((sum, line) => sum + line.earmarkedIncome, 0);
  const expectedTotalIncome =
    openingBalance + earmarkedIncome + incomeToDate + expectedFurtherIncome;

  const yearBudgetFor = (line: LineForProjection): number => {
    switch (line.allocationKind) {
      case 'monthly':
        return line.allocationAmount * totalMonths + line.earmarkedIncome;
      case 'annual':
        return line.allocationAmount + line.earmarkedIncome;
      case 'earmarked':
        return line.earmarkedIncome;
      case 'schedule':
        return line.scheduled.year + line.earmarkedIncome;
      case 'residual':
      default:
        return 0;
    }
  };

  const claimedByOthers = lines
    .filter((line) => line.allocationKind !== 'residual')
    .reduce((sum, line) => sum + yearBudgetFor(line), 0);

  const forecastFor = (line: LineForProjection, yearBudget: number): number => {
    const owed = line.scheduled.remaining;
    if (line.closed) {
      return owed;
    }
    if (line.allocationKind === 'annual') {
      return Math.max(yearBudget - line.actual, owed);
    }
    if (line.allocationKind === 'monthly') {
      const expected = line.discretionary
        ? line.pacePerMonth * spendMonths
        : line.allocationAmount * remainingMonths;
      return Math.max(expected, owed);
    }
    return owed;
  };

  const projected = lines.map<ProjectedLine>((line) => {
    const yearBudget =
      line.allocationKind === 'residual'
        ? Math.max(expectedTotalIncome - claimedByOthers, 0)
        : yearBudgetFor(line);
    const forecastRemaining = forecastFor(line, yearBudget);
    const projectedSpend = line.actual + forecastRemaining;
    const atBudget =
      line.allocationKind === 'monthly' && line.discretionary && !line.closed
        ? line.actual + line.allocationAmount * spendMonths
        : projectedSpend;
    const committed = line.scheduled.remaining;
    const remaining = yearBudget - line.actual - committed;
    return {
      ...line,
      unspentIsSaved: line.allocationKind !== 'annual' || line.closed,
      yearBudget,
      forecastRemaining,
      projectedSpend,
      variance: projectedSpend - yearBudget,
      varianceAtBudget: atBudget - yearBudget,
      committed,
      remaining,
      perMonthRemaining: remainingMonths > 0 ? remaining / remainingMonths : remaining,
      overspent: remaining < 0,
    };
  });

  const residualLines = projected.filter((line) => line.allocationKind === 'residual');
  const residual = residualLines.length > 0 ? residualLines[0] : null;
  const residualBudget = residual === null ? 0 : residual.yearBudget;
  const spendLines = projected.filter((line) => line.allocationKind !== 'residual');

  const sumBy = (pick: (line: ProjectedLine) => number) =>
    spendLines.reduce((sum, line) => sum + pick(line), 0);
  const projectedAtPace = residualBudget - sumBy((line) => line.variance) - unrecordedSpend;
  const projectedAtBudget =
    residualBudget - sumBy((line) => line.varianceAtBudget) - unrecordedSpend;

  const discretionary = spendLines.filter(
    (line) => line.discretionary && line.allocationKind === 'monthly',
  );
  const commitmentsRemaining = sumBy((line) =>
    line.discretionary && line.allocationKind === 'monthly' ? 0 : line.forecastRemaining,
  );
  const discretionaryRemaining = discretionary.reduce(
    (sum, line) => sum + line.forecastRemaining,
    0,
  );

  const goal = residual === null ? 0 : residual.allocationAmount;
  const target = goal > 0 ? goal : residualBudget;
  const fixedVariance = sumBy((line) =>
    discretionary.includes(line) ? line.actual - line.yearBudget : line.variance,
  );
  const affordable = residualBudget - target - fixedVariance - unrecordedSpend;

  return {
    elapsedMonths,
    remainingMonths,
    spendMonths,
    totalMonths,
    incomeToDate,
    expectedTotalIncome,
    lines: projected,
    projectedAtPace,
    projectedAtBudget,
    goal: target,
    investedSoFar: residual === null ? 0 : residual.actual,
    commitmentsRemaining,
    discretionaryRemaining,
    unrecordedSpend,
    pacePerMonth: discretionary.reduce((sum, line) => sum + line.pacePerMonth, 0),
    budgetPerMonth: discretionary.reduce((sum, line) => sum + line.allocationAmount, 0),
    safeToSpendPerMonth: spendMonths > 0 ? affordable / spendMonths : affordable,
    affordable,
  };
};

export type CycleAllowance = {
  perMonth: number;
  allowance: number;
  spent: number;
  remaining: number;
  perDay: number;
  onPace: number;
  spentPerDay: number;
};

export const cycleAllowance = ({
  affordable,
  spent,
  monthsFromCycleStart,
  cycleMonths,
  daysLeftInCycle,
  daysInCycle,
}: {
  affordable: number;
  spent: number;
  monthsFromCycleStart: number;
  cycleMonths: number;
  daysLeftInCycle: number;
  daysInCycle: number;
}): CycleAllowance => {
  const atOpening = affordable + spent;
  const perMonth = monthsFromCycleStart > 0 ? atOpening / monthsFromCycleStart : atOpening;
  const allowance = monthsFromCycleStart > cycleMonths ? perMonth * cycleMonths : atOpening;
  const remaining = allowance - spent;
  const daysGone = Math.min(daysInCycle - daysLeftInCycle + 1, daysInCycle);
  const onPace = daysInCycle > 0 ? (allowance * daysGone) / daysInCycle : allowance;
  return {
    perMonth,
    allowance,
    spent,
    remaining,
    perDay: daysLeftInCycle > 0 ? remaining / daysLeftInCycle : remaining,
    onPace,
    spentPerDay: daysGone > 0 ? spent / daysGone : spent,
  };
};
