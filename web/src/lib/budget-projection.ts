/** Milliseconds are avoided here: months are what the budget is expressed in. */
const MONTHS_PER_YEAR = 12;

export type LineForProjection = {
  lineId: string;
  name: string;
  allocationKind: 'monthly' | 'annual' | 'residual' | 'earmarked';
  allocationAmount: number;
  discretionary: boolean;
  actual: number;
  /** Income routed specifically at this line -- a trip paid for out of a bonus. */
  earmarkedIncome: number;
};

export type ProjectedLine = LineForProjection & {
  /** What this line gets for the whole year. */
  yearBudget: number;
  /**
   * What it should have had by now. Comparing a full year's allowance against
   * ten months of spending would call every line under budget.
   */
  budgetToDate: number;
  /** Over (positive) or under (negative) that allowance so far. */
  variance: number;
  remaining: number;
  /** What is left to spend per month over the rest of the year. */
  perMonthRemaining: number;
  overspent: boolean;
};

export type Projection = {
  elapsedMonths: number;
  remainingMonths: number;
  totalMonths: number;
  incomeToDate: number;
  expectedTotalIncome: number;
  lines: ProjectedLine[];
  /** The residual: what is expected to survive the waterfall. */
  projectedResidual: number;
  residualGoal: number;
};

/** Whole months between two dates, fractional so a part-month is not lost. */
export const monthsBetween = (from: Date, to: Date): number => {
  const whole =
    (to.getFullYear() - from.getFullYear()) * MONTHS_PER_YEAR + (to.getMonth() - from.getMonth());
  const dayFraction = (to.getDate() - from.getDate()) / 30;
  return Math.max(whole + dayFraction, 0);
};

/**
 * Turn allocations and actuals into what is left, and at what pace.
 *
 * Income yet to arrive is projected from what has arrived rather than
 * configured: a rate that is wrong corrects itself as the year runs, where a
 * number typed in once stays wrong. The residual is whatever the lines above it
 * do not take, which is the point of the waterfall -- saving is what survives,
 * not something budgeted for.
 */
export const project = (
  lines: LineForProjection[],
  incomeToDate: number,
  elapsedMonths: number,
  totalMonths: number,
): Projection => {
  const remainingMonths = Math.max(totalMonths - elapsedMonths, 0);
  const runRate = elapsedMonths > 0 ? incomeToDate / elapsedMonths : 0;
  const expectedTotalIncome = incomeToDate + runRate * remainingMonths;

  // Income pointed at a line raises its budget whatever kind it is. A trip paid
  // for out of a bonus is funded, not overspent, and a shopping envelope topped
  // up by cashbacks is bigger than the figure typed into it.
  const yearBudgetFor = (line: LineForProjection): number => {
    switch (line.allocationKind) {
      case 'monthly':
        return line.allocationAmount * totalMonths + line.earmarkedIncome;
      case 'annual':
        return line.allocationAmount + line.earmarkedIncome;
      case 'earmarked':
        return line.earmarkedIncome;
      case 'residual':
      default:
        return 0;
    }
  };

  const claimedByOthers = lines
    .filter((line) => line.allocationKind !== 'residual')
    .reduce((sum, line) => sum + yearBudgetFor(line), 0);

  const projected = lines.map<ProjectedLine>((line) => {
    const yearBudget =
      line.allocationKind === 'residual'
        ? Math.max(expectedTotalIncome - claimedByOthers, 0)
        : yearBudgetFor(line);
    const remaining = yearBudget - line.actual;
    // Monthly lines accrue a twelfth at a time, so only what has accrued counts.
    // An envelope is a pot for the whole year: spending it in March is early,
    // not excessive, and pro-rating it would call that overspending.
    const budgetToDate =
      line.allocationKind === 'monthly'
        ? line.allocationAmount * elapsedMonths + line.earmarkedIncome
        : yearBudget;
    return {
      ...line,
      yearBudget,
      budgetToDate,
      variance: line.actual - budgetToDate,
      remaining,
      perMonthRemaining: remainingMonths > 0 ? remaining / remainingMonths : remaining,
      overspent: remaining < 0,
    };
  });

  // What is actually expected to be left over, rather than what was allocated:
  // overspending above shows up here as a smaller number, which is the whole
  // point of watching it.
  const spentOnLines = lines
    .filter((line) => line.allocationKind !== 'residual')
    .reduce((sum, line) => sum + line.actual, 0);
  const residualLine = projected.find((line) => line.allocationKind === 'residual');

  return {
    elapsedMonths,
    remainingMonths,
    totalMonths,
    incomeToDate,
    expectedTotalIncome,
    lines: projected,
    projectedResidual: expectedTotalIncome - spentOnLines,
    residualGoal: residualLine?.yearBudget ?? 0,
  };
};
