import { type Database } from '@/lib/db';
import { getFinancialYearStart } from '@/lib/salary';
import { getSalaryPageData } from '@/server/routers/salary';

export type PendingIncome = {
  /** Regular pay still to be received inside the window, net of deductions. */
  salary: number;
  /** Forecast bonuses inside the window, net of the tax withheld against them. */
  bonus: number;
  /** How many pay dates are still to come, counted rather than inferred. */
  payments: number;
};

/**
 * What the payroll still owes before the window closes.
 *
 * Read off the salary schedule rather than averaged out of what has already
 * landed. An average cannot know about a revision -- a raise in November is
 * invisible to it until November -- and it cannot know that the last pay date
 * of a budget year falls two days after the year ends.
 *
 * Bonuses come back separately because they are not ordinary income and are
 * rarely treated as such: one may be earmarked at whatever it paid for and
 * another kept out of the budget entirely, which is a choice about that bonus
 * rather than about the salary it happens to be paid alongside.
 */
export const getPendingIncome = async (
  db: Database,
  userId: string,
  from: Date,
  to: Date,
): Promise<PendingIncome> => {
  // A budget year rarely lines up with a tax year, so both of the financial
  // years the window touches are read and the rows outside it dropped.
  const financialYears = new Set([getFinancialYearStart(from), getFinancialYearStart(to)]);

  let salary = 0;
  let bonus = 0;
  let payments = 0;
  for (const financialYearStart of financialYears) {
    const { rows } = await getSalaryPageData(db, userId, financialYearStart);
    for (const row of rows) {
      const unpaid = row.status !== 'actual';
      if (!unpaid || row.paymentDate < from || row.paymentDate >= to) {
        continue;
      }
      payments += 1;
      for (const component of row.components) {
        // A bonus is its own earning plus the tax withheld for it, which the
        // schedule files as a separate adjustment rather than against the bonus.
        // The rows are a union: a scheduled component carries neither field, a
        // bonus carries an id, and the tax withheld for it carries a marker.
        const bonusId = 'bonusId' in component ? component.bonusId : null;
        const adjustment =
          'forecastAdjustment' in component ? component.forecastAdjustment : undefined;
        const belongsToBonus = bonusId !== null || adjustment === 'bonus_tds';
        const signed = component.kind === 'earning' ? component.amount : -component.amount;
        if (belongsToBonus) {
          bonus += signed;
        } else {
          salary += signed;
        }
      }
    }
  }

  return { salary: roundToPaise(salary), bonus: roundToPaise(bonus), payments };
};

const PAISE = 100;
const roundToPaise = (value: number) => Math.round(value * PAISE) / PAISE;
