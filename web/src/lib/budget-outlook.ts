/**
 * What the rest of the year looks like in cash.
 *
 * This is the question a budget is actually asked: given what I hold, what is
 * still coming, and what is already promised, how much can I spend between now
 * and the end of the year -- and what will be left to invest if I do.
 *
 * Deliberately a running balance rather than a budget-versus-actual table. The
 * second tells you where you have been; only the first tells you what you can
 * do next.
 */
export type OutlookInput = {
  /** Money on hand today, net of what is owed. */
  balanceToday: number;
  /** Regular income per month, bonuses excluded. */
  monthlyIncome: number;
  /**
   * Salaries still to come. Not the same as the months left to live through: a
   * year can end with a month you have to eat in but are not paid for.
   */
  incomeCyclesRemaining: number;
  /** Calendar months still to be spent in. */
  monthsRemaining: number;
  /** Fixed commitments per month -- rent, money sent home. */
  fixedPerMonth: number;
  /** Loan installments still to be paid inside the window. */
  emiRemaining: number;
  /** What is left in the annual envelopes and still intended to be spent. */
  envelopesRemaining: number;
  /** Spent per month on everything discretionary, at the pace so far. */
  livingPerMonthActual: number;
  /** What that was supposed to be. */
  livingPerMonthBudget: number;
  investedSoFar: number;
  investmentGoal: number;
};

export type Outlook = {
  incomeCyclesRemaining: number;
  monthsRemaining: number;
  incomeRemaining: number;
  totalAvailable: number;
  fixedRemaining: number;
  emiRemaining: number;
  envelopesRemaining: number;
  afterCommitments: number;
  /** Spendable per month if the investment goal is to be met exactly. */
  safeToSpendPerMonth: number;
  atCurrentPace: { living: number; invests: number; yearTotal: number };
  atBudgetPace: { living: number; invests: number; yearTotal: number };
  investmentGoal: number;
  investedSoFar: number;
};

export const buildOutlook = (input: OutlookInput): Outlook => {
  const {
    balanceToday,
    monthlyIncome,
    incomeCyclesRemaining,
    monthsRemaining,
    fixedPerMonth,
    emiRemaining,
    envelopesRemaining,
    livingPerMonthActual,
    livingPerMonthBudget,
    investedSoFar,
    investmentGoal,
  } = input;

  const incomeRemaining = monthlyIncome * incomeCyclesRemaining;
  const totalAvailable = balanceToday + incomeRemaining;
  // Rent and money home go out with each salary, so they follow the pay cycles
  // rather than the calendar.
  const fixedRemaining = fixedPerMonth * incomeCyclesRemaining;
  const afterCommitments = totalAvailable - fixedRemaining - emiRemaining - envelopesRemaining;

  const outcome = (perMonth: number) => {
    const living = perMonth * monthsRemaining;
    const invests = afterCommitments - living;
    return { living, invests, yearTotal: investedSoFar + invests };
  };

  // What is left to invest this year, spread over the months that remain.
  const stillToInvest = Math.max(investmentGoal - investedSoFar, 0);
  const safeToSpendPerMonth =
    monthsRemaining > 0 ? (afterCommitments - stillToInvest) / monthsRemaining : 0;

  return {
    incomeCyclesRemaining,
    monthsRemaining,
    incomeRemaining,
    totalAvailable,
    fixedRemaining,
    emiRemaining,
    envelopesRemaining,
    afterCommitments,
    safeToSpendPerMonth,
    atCurrentPace: outcome(livingPerMonthActual),
    atBudgetPace: outcome(livingPerMonthBudget),
    investmentGoal,
    investedSoFar,
  };
};
