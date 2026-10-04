import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { getFinancialYearStart } from '@/lib/salary';
import { getSalaryPageData } from '@/server/routers/salary';

export type PendingIncome = {
  salary: number;
  bonus: number;
  payments: number;
};

export const getPendingIncome = instrumentedFunction(
  'getPendingIncome',
  async (db: Database, userId: string, from: Date, to: Date): Promise<PendingIncome> => {
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
  },
);

const PAISE = 100;
const roundToPaise = (value: number) => Math.round(value * PAISE) / PAISE;
