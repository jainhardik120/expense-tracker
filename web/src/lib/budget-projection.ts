/** Milliseconds are avoided here: months are what the budget is expressed in. */
const MONTHS_PER_YEAR = 12;
/** Nominal month length, used only to prorate a partial month. */
const DAYS_PER_MONTH = 30;

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
  /**
   * The same variance had discretionary spending held to its allowance rather
   * than continued at the rate it is actually running at. The difference
   * between the two is what changing behaviour is worth.
   */
  varianceAtBudget: number;
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
  /**
   * Instalments already signed for and not yet paid.
   *
   * Spending is what has left the account; this is what is going to leave it
   * whatever happens next. A flight booked in September on a three month plan
   * is money the year has already lost, even though two thirds of it is dated
   * in the future.
   */
  committed: number;
  /** What is left once both the spending and the commitments are taken off. */
  remaining: number;
  /** What is left to spend per month over the rest of the year. */
  perMonthRemaining: number;
  overspent: boolean;
};

export type Projection = {
  elapsedMonths: number;
  /** Pay cycles still to come. */
  remainingMonths: number;
  /** Calendar months still to be spent in, which is the pace that matters. */
  spendMonths: number;
  totalMonths: number;
  incomeToDate: number;
  expectedTotalIncome: number;
  lines: ProjectedLine[];
  /** What survives the waterfall if spending carries on as it has been. */
  projectedAtPace: number;
  /** What survives if discretionary spending is held to its allowance. */
  projectedAtBudget: number;
  /** What the residual line is aiming at, if a figure was set on it. */
  goal: number;
  /** Already banked into the residual -- money actually invested. */
  investedSoFar: number;
  /** Still owed on things not chosen month to month: rent, loans, envelopes. */
  commitmentsRemaining: number;
  /** Still expected to be spent on the things that are chosen. */
  discretionaryRemaining: number;
  /** Spent but not yet written down, so not attributable to any line. */
  unrecordedSpend: number;
  /** What discretionary spending is actually running at, per month. */
  pacePerMonth: number;
  /** What it was supposed to run at. */
  budgetPerMonth: number;
  /**
   * What discretionary spending can run at, per month, and still reach the goal.
   * Negative means the goal is already out of reach without cutting commitments.
   */
  safeToSpendPerMonth: number;
};

/** Whole months between two dates, fractional so a part-month is not lost. */
export const monthsBetween = (from: Date, to: Date): number => {
  const whole =
    (to.getFullYear() - from.getFullYear()) * MONTHS_PER_YEAR + (to.getMonth() - from.getMonth());
  const dayFraction = (to.getDate() - from.getDate()) / DAYS_PER_MONTH;
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
  /** What the year opened with: last year's residual, already yours to spend. */
  openingBalance = 0,
  /**
   * Calendar months left to spend in, which is not the number of salaries left.
   * You still eat in December whether or not one arrives in it, so discretionary
   * spending is forecast over this while commitments follow the pay cycles.
   */
  spendMonthsRemaining = -1,
  /**
   * Spending known about but not yet written down -- messages still sitting in
   * the inbox. It cannot be put against a line, because nothing has classified
   * it yet, but the money has gone all the same and the residual is the honest
   * place for it.
   */
  unrecordedSpend = 0,
): Projection => {
  const remainingMonths = Math.max(totalMonths - elapsedMonths, 0);
  const spendMonths = spendMonthsRemaining < 0 ? remainingMonths : spendMonthsRemaining;
  const runRate = elapsedMonths > 0 ? incomeToDate / elapsedMonths : 0;
  // Everything the year has to spend, not just the salary. Income pointed at a
  // particular line is still income -- a bonus that paid for the trip funded it
  // out of the same pot -- and leaving it out while subtracting the line it
  // funds understates what is left by exactly that much. The balance carried in
  // from last year belongs here too: it was earned then and kept, not spent.
  const earmarkedIncome = lines.reduce((sum, line) => sum + line.earmarkedIncome, 0);
  const expectedTotalIncome =
    openingBalance + earmarkedIncome + incomeToDate + runRate * remainingMonths;

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
      // A commitment goes out with each salary; everything else goes out with
      // the calendar, and the two run out at different times.
      return line.discretionary
        ? line.pacePerMonth * spendMonths
        : line.allocationAmount * remainingMonths;
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
    const atBudget =
      line.allocationKind === 'monthly' && line.discretionary
        ? line.actual + line.allocationAmount * spendMonths
        : projectedSpend;
    // Commitments come off alongside the spending. A line whose budget is the
    // schedule itself lands on zero, which is right -- an instalment plan has
    // nothing left over -- and an envelope with a loan inside it stops
    // advertising money that is already spoken for.
    const committed = line.scheduled.remaining;
    const remaining = yearBudget - line.actual - committed;
    return {
      ...line,
      unspentIsSaved: line.allocationKind !== 'annual',
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

  // A budget need not have a residual line at all, so this is read defensively:
  // without one there is nothing left over to report on.
  const residualLines = projected.filter((line) => line.allocationKind === 'residual');
  const residual = residualLines.length > 0 ? residualLines[0] : null;
  const residualBudget = residual === null ? 0 : residual.yearBudget;
  const spendLines = projected.filter((line) => line.allocationKind !== 'residual');

  // Every rupee a line spends above its budget is a rupee the residual does not
  // get, so what will be left is the residual's budget less the variances. One
  // basis for both readings, rather than a second calculation that can drift.
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

  // A figure set on the residual line is a target; with none, the plan's own
  // outcome is the target and there is nothing to fall short of.
  const goal = residual === null ? 0 : residual.allocationAmount;
  const target = goal > 0 ? goal : residualBudget;
  // Solve for the discretionary spend that lands exactly on the target: every
  // other line's variance is already fixed, so only this is free to move.
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
  };
};
