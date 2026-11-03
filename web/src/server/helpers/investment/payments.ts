import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import { investmentPayments, statements } from '@/db/schema';
import type { Database } from '@/lib/db';

import type { EnrichedInvestment, InvestmentsPageData } from './models';

export type InvestmentWithPayments = EnrichedInvestment & {
  paidAmount: number | null;
  charges: number | null;
};

const PAISE_PER_RUPEE = 100;

export const roundCurrency = (value: number) =>
  Math.round(value * PAISE_PER_RUPEE) / PAISE_PER_RUPEE;

export const attachPaymentTotals = async (
  db: Database,
  data: InvestmentsPageData,
): Promise<
  Omit<InvestmentsPageData, 'table'> & {
    table: Omit<InvestmentsPageData['table'], 'investments'> & {
      investments: InvestmentWithPayments[];
    };
  }
> => {
  const ids = data.table.investments.map((investment) => investment.id);
  const totals =
    ids.length === 0
      ? []
      : await db
          .select({
            investmentId: investmentPayments.investmentId,
            paid: sql<string>`sum(${investmentPayments.amount})`,
          })
          .from(investmentPayments)
          .innerJoin(statements, eq(statements.id, investmentPayments.statementId))
          .where(and(inArray(investmentPayments.investmentId, ids), lt(statements.amount, '0')))
          .groupBy(investmentPayments.investmentId);
  const paidById = new Map(totals.map((row) => [row.investmentId, Number(row.paid)]));
  return {
    ...data,
    table: {
      ...data.table,
      investments: data.table.investments.map((investment) => {
        const paid = paidById.get(investment.id);
        return {
          ...investment,
          paidAmount: paid ?? null,
          charges: paid === undefined ? null : roundCurrency(paid - investment.investedAmountInr),
        };
      }),
    },
  };
};
