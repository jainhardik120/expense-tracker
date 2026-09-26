/** Milliseconds are avoided here: months are what the budget is expressed in. */
const MONTHS_PER_YEAR = 12;

export type LineForProjection = {
  lineId: string;
  name: string;
  allocationKind: 'monthly' | 'annual' | 'residual' | 'earmarked' | 'schedule';
  allocationAmount: number;
  discretionary: boolean;
  actual: number;
  /** Income routed specifically at this line -- a trip paid for out of a bonus. */
  earmarkedIncome: number;
  /** What the loan and recurring schedules say still falls inside the window. */
  scheduled: { year: number; toDate: number; remaining: number };
  /** Spend per month at the rate so far, used to forecast discretionary lines. */
  pacePerMonth: number;
};

export type ProjectedLine = LineForProjection & {
  /** What is still expected to be spent before the year closes. */
  forecastRemaining: number;
  /** Actual so far plus that forecast: what this line will cost by December. */
  projectedSpend: number;
  /**
   * Whether money not spent here is reserved for later or simply saved. An
   * envelope holds its balance for the trip still to be booked; paying less rent
   * than budgeted is not a plan to pay more rent later, it is money saved.
   */
  unspentIsSaved: boolean;
  /** What this line gets for the whole year. */
  yearBudget: number;
  /** Over (positive) or under (negative) the year's budget, once the year ends. */
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
      case 'schedule':
        // The schedule is the budget: an instalment cannot be overspent.
        return line.scheduled.year + line.earmarkedIncome;
      case 'residual':
      default:
        return 0;
    }
  };

  const claimedByOthers = lines
    .filter((line) => line.allocationKind !== 'residual')
    .reduce((sum, line) => sum + yearBudgetFor(line), 0);

  /**
   * What a line still has to pay before December.
   *
   * Commitments are known: the instalments left on a loan are a fact, not a
   * guess. A fixed monthly line will go on costing its rate. A discretionary one
   * is forecast at the rate it has actually been running at, not the rate it was
   * supposed to -- the point is what will happen, not what was hoped. Envelopes
   * are assumed to be used, because the flight home is still going to be booked.
   */
  const forecastFor = (line: LineForProjection, yearBudget: number): number => {
    if (line.allocationKind === 'annual') {
      return Math.max(yearBudget - line.actual, 0);
    }
    if (line.allocationKind === 'monthly') {
      const rate = line.discretionary ? line.pacePerMonth : line.allocationAmount;
      return rate * remainingMonths;
    }
    // Earmarked, schedule and residual lines only owe what is already scheduled.
    return line.scheduled.remaining;
  };

  const projected = lines.map<ProjectedLine>((line) => {
    const yearBudget =
      line.allocationKind === 'residual'
        ? Math.max(expectedTotalIncome - claimedByOthers, 0)
        : yearBudgetFor(line);
    const forecastRemaining = forecastFor(line, yearBudget);
    const projectedSpend = line.actual + forecastRemaining;
    const remaining = yearBudget - line.actual;
    return {
      ...line,
      unspentIsSaved: line.allocationKind !== 'annual',
      yearBudget,
      forecastRemaining,
      projectedSpend,
      variance: projectedSpend - yearBudget,
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
