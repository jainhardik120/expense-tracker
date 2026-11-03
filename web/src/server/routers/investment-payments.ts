import { TRPCError } from '@trpc/server';
import { addDays, differenceInCalendarDays, subDays } from 'date-fns';
import { and, asc, eq, gte, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  bankAccount,
  investmentPayments,
  investments,
  marketInstruments,
  mutualFundSchemes,
  selfTransferStatements,
  statements,
} from '@/db/schema';
import type { Database } from '@/lib/db';
import { roundCurrency } from '@/server/helpers/investment/payments';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { amount } from '@/types';

const PAYMENT_LOOKBACK_DAYS = 180;
const PAYMENT_LOOKAHEAD_DAYS = 10;
const INVESTMENT_LOOKBACK_DAYS = 10;
const INVESTMENT_LOOKAHEAD_DAYS = 180;
const PAISA = 0.005;
const INVESTMENT_CATEGORY = 'Investment';

const instrumentName = sql<
  string | null
>`coalesce(${mutualFundSchemes.schemeName}, ${marketInstruments.name})`;

const allocatedByStatement = async (db: Database, statementIds: string[]) => {
  if (statementIds.length === 0) {
    return new Map<string, number>();
  }
  const rows = await db
    .select({
      statementId: investmentPayments.statementId,
      total: sql<string>`sum(${investmentPayments.amount})`,
    })
    .from(investmentPayments)
    .where(inArray(investmentPayments.statementId, statementIds))
    .groupBy(investmentPayments.statementId);
  return new Map(rows.map((row) => [row.statementId, Number(row.total)]));
};

const allocatedByInvestment = async (db: Database, investmentIds: string[]) => {
  if (investmentIds.length === 0) {
    return new Map<string, number>();
  }
  const rows = await db
    .select({
      investmentId: investmentPayments.investmentId,
      total: sql<string>`sum(${investmentPayments.amount})`,
    })
    .from(investmentPayments)
    .where(inArray(investmentPayments.investmentId, investmentIds))
    .groupBy(investmentPayments.investmentId);
  return new Map(rows.map((row) => [row.investmentId, Number(row.total)]));
};

const investmentWithName = (db: Database) =>
  db
    .select({
      id: investments.id,
      kind: investments.investmentKind,
      code: investments.instrumentCode,
      investmentDate: investments.investmentDate,
      investmentAmount: investments.investmentAmount,
      units: investments.units,
      name: instrumentName,
    })
    .from(investments)
    .leftJoin(
      mutualFundSchemes,
      and(
        eq(investments.investmentKind, 'mutual_funds'),
        eq(mutualFundSchemes.schemeCode, investments.instrumentCode),
      ),
    )
    .leftJoin(
      marketInstruments,
      eq(
        marketInstruments.instrumentKey,
        sql`${investments.investmentKind} || ':' || coalesce(${investments.stockMarket}, 'IN') || ':' || ${investments.instrumentCode}`,
      ),
    );

const getOwnedInvestment = async (db: Database, userId: string, investmentId: string) => {
  const rows = await investmentWithName(db).where(
    and(eq(investments.id, investmentId), eq(investments.userId, userId)),
  );
  if (rows.length === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Investment not found' });
  }
  return rows[0];
};

const getOwnedStatement = async (db: Database, userId: string, statementId: string) => {
  const rows = await db
    .select({
      id: statements.id,
      amount: statements.amount,
      createdAt: statements.createdAt,
      category: statements.category,
      tags: statements.tags,
      accountName: bankAccount.accountName,
    })
    .from(statements)
    .leftJoin(bankAccount, eq(bankAccount.id, statements.accountId))
    .where(and(eq(statements.id, statementId), eq(statements.userId, userId)));
  if (rows.length === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Statement not found' });
  }
  return rows[0];
};

type FundingSource = { at: Date; amount: number };

const traceTransferFunding = async (
  db: Database,
  userId: string,
  accountId: string,
  statementId: string,
): Promise<FundingSource[] | null> => {
  const [ownIncome] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(statements)
    .where(
      and(
        eq(statements.userId, userId),
        eq(statements.accountId, accountId),
        sql`${statements.amount} > 0`,
      ),
    );
  if (ownIncome.count > 0) {
    return null;
  }
  const outflows = await db
    .select({ id: statements.id, at: statements.createdAt, amount: statements.amount })
    .from(statements)
    .where(and(eq(statements.userId, userId), eq(statements.accountId, accountId)));
  const transfers = await db
    .select({
      at: selfTransferStatements.createdAt,
      amount: selfTransferStatements.amount,
      toId: selfTransferStatements.toAccountId,
    })
    .from(selfTransferStatements)
    .where(
      and(
        eq(selfTransferStatements.userId, userId),
        or(
          eq(selfTransferStatements.toAccountId, accountId),
          eq(selfTransferStatements.fromAccountId, accountId),
        ),
      ),
    );
  const events = [
    ...transfers.map((row) =>
      row.toId === accountId
        ? { kind: 'in' as const, at: row.at, amount: Number(row.amount), id: null }
        : { kind: 'out' as const, at: row.at, amount: Number(row.amount), id: null },
    ),
    ...outflows.map((row) => ({
      kind: 'out' as const,
      at: row.at,
      amount: Math.abs(Number(row.amount)),
      id: row.id,
    })),
  ].sort((a, b) => {
    const byTime = a.at.getTime() - b.at.getTime();
    if (byTime !== 0) {
      return byTime;
    }
    return a.kind === 'in' ? -1 : 1;
  });
  const queue: FundingSource[] = [];
  for (const event of events) {
    if (event.kind === 'in') {
      queue.push({ at: event.at, amount: event.amount });
      continue;
    }
    let need = event.amount;
    const used: FundingSource[] = [];
    while (need > PAISA && queue.length > 0) {
      const head = queue[0];
      const take = Math.min(head.amount, need);
      used.push({ ...head, amount: roundCurrency(take) });
      head.amount -= take;
      need -= take;
      if (head.amount <= PAISA) {
        queue.shift();
      }
    }
    if (event.id === statementId) {
      return used;
    }
  }
  return [];
};

const summarise = (
  invested: number,
  payments: { amount: number; paidAt: Date }[],
  investedAt: Date,
) => {
  const paid = roundCurrency(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const firstPaidAt = payments.reduce<Date | null>(
    (earliest, payment) =>
      earliest === null || payment.paidAt < earliest ? payment.paidAt : earliest,
    null,
  );
  return {
    paid,
    invested,
    fees: payments.length === 0 ? null : roundCurrency(paid - invested),
    feePercentage: payments.length === 0 || invested === 0 ? null : (paid - invested) / invested,
    firstPaidAt,
    daysToInvest: firstPaidAt === null ? null : differenceInCalendarDays(investedAt, firstPaidAt),
  };
};

export const investmentPaymentsRouter = createTRPCRouter({
  getForInvestment: protectedProcedure
    .input(z.object({ investmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const investment = await getOwnedInvestment(ctx.db, ctx.user.id, input.investmentId);
      const rows = await ctx.db
        .select({
          id: investmentPayments.id,
          amount: investmentPayments.amount,
          statementId: statements.id,
          statementAmount: statements.amount,
          paidAt: statements.createdAt,
          category: statements.category,
          accountId: statements.accountId,
          accountName: bankAccount.accountName,
        })
        .from(investmentPayments)
        .innerJoin(statements, eq(statements.id, investmentPayments.statementId))
        .leftJoin(bankAccount, eq(bankAccount.id, statements.accountId))
        .where(
          and(
            eq(investmentPayments.investmentId, investment.id),
            eq(investmentPayments.userId, ctx.user.id),
          ),
        )
        .orderBy(asc(statements.createdAt));
      const allocated = await allocatedByStatement(
        ctx.db,
        rows.map((row) => row.statementId),
      );
      const payments = await Promise.all(
        rows.map(async (row) => {
          const fundedBy =
            row.accountId === null
              ? null
              : await traceTransferFunding(ctx.db, ctx.user.id, row.accountId, row.statementId);
          const mainFunding = fundedBy?.reduce<FundingSource | null>(
            (largest, source) =>
              largest === null || source.amount > largest.amount ? source : largest,
            null,
          );
          return {
            id: row.id,
            statementId: row.statementId,
            amount: Number(row.amount),
            statementAmount: Math.abs(Number(row.statementAmount)),
            sharedWith: roundCurrency((allocated.get(row.statementId) ?? 0) - Number(row.amount)),
            spentAt: row.paidAt,
            paidAt: mainFunding?.at ?? row.paidAt,
            accountName: row.accountName,
            category: row.category,
          };
        }),
      );
      return {
        investment: {
          ...investment,
          investmentAmount: Number(investment.investmentAmount),
        },
        payments,
        summary: summarise(
          Number(investment.investmentAmount),
          payments,
          investment.investmentDate,
        ),
      };
    }),

  getPaymentCandidates: protectedProcedure
    .input(z.object({ investmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const investment = await getOwnedInvestment(ctx.db, ctx.user.id, input.investmentId);
      const rows = await ctx.db
        .select({
          id: statements.id,
          amount: statements.amount,
          createdAt: statements.createdAt,
          category: statements.category,
          tags: statements.tags,
          accountName: bankAccount.accountName,
        })
        .from(statements)
        .leftJoin(bankAccount, eq(bankAccount.id, statements.accountId))
        .where(
          and(
            eq(statements.userId, ctx.user.id),
            eq(statements.category, INVESTMENT_CATEGORY),
            lt(statements.amount, '0'),
            gte(statements.createdAt, subDays(investment.investmentDate, PAYMENT_LOOKBACK_DAYS)),
            lte(statements.createdAt, addDays(investment.investmentDate, PAYMENT_LOOKAHEAD_DAYS)),
          ),
        );
      const allocated = await allocatedByStatement(
        ctx.db,
        rows.map((row) => row.id),
      );
      const linked = await ctx.db
        .select({ statementId: investmentPayments.statementId })
        .from(investmentPayments)
        .where(eq(investmentPayments.investmentId, investment.id));
      const linkedIds = new Set(linked.map((row) => row.statementId));
      return rows
        .map((row) => {
          const total = Math.abs(Number(row.amount));
          return {
            ...row,
            amount: total,
            remaining: roundCurrency(total - (allocated.get(row.id) ?? 0)),
            distanceDays: Math.abs(
              differenceInCalendarDays(investment.investmentDate, row.createdAt),
            ),
          };
        })
        .filter((row) => row.remaining > PAISA && !linkedIds.has(row.id))
        .sort((a, b) => a.distanceDays - b.distanceDays);
    }),

  getForStatement: protectedProcedure
    .input(z.object({ statementId: z.string() }))
    .query(async ({ ctx, input }) => {
      const statement = await getOwnedStatement(ctx.db, ctx.user.id, input.statementId);
      const links = await ctx.db
        .select({
          id: investmentPayments.id,
          investmentId: investmentPayments.investmentId,
          amount: investmentPayments.amount,
        })
        .from(investmentPayments)
        .where(
          and(
            eq(investmentPayments.statementId, statement.id),
            eq(investmentPayments.userId, ctx.user.id),
          ),
        );
      const linkedInvestments =
        links.length === 0
          ? []
          : await investmentWithName(ctx.db).where(
              inArray(
                investments.id,
                links.map((link) => link.investmentId),
              ),
            );
      const byId = new Map(linkedInvestments.map((row) => [row.id, row]));
      const total = Math.abs(Number(statement.amount));
      const allocated = roundCurrency(links.reduce((sum, link) => sum + Number(link.amount), 0));
      const candidates = await investmentWithName(ctx.db).where(
        and(
          eq(investments.userId, ctx.user.id),
          gte(investments.investmentDate, subDays(statement.createdAt, INVESTMENT_LOOKBACK_DAYS)),
          lte(investments.investmentDate, addDays(statement.createdAt, INVESTMENT_LOOKAHEAD_DAYS)),
        ),
      );
      const paidByInvestment = await allocatedByInvestment(
        ctx.db,
        candidates.map((row) => row.id),
      );
      const linkedIds = new Set(links.map((link) => link.investmentId));
      return {
        statement: { ...statement, amount: total },
        allocated,
        remaining: roundCurrency(total - allocated),
        links: links.flatMap((link) => {
          const investment = byId.get(link.investmentId);
          return investment === undefined
            ? []
            : [
                {
                  id: link.id,
                  amount: Number(link.amount),
                  investment: {
                    ...investment,
                    investmentAmount: Number(investment.investmentAmount),
                  },
                },
              ];
        }),
        candidates: candidates
          .filter((row) => !linkedIds.has(row.id))
          .map((row) => ({
            ...row,
            investmentAmount: Number(row.investmentAmount),
            alreadyPaid: paidByInvestment.get(row.id) ?? 0,
            distanceDays: Math.abs(
              differenceInCalendarDays(row.investmentDate, statement.createdAt),
            ),
          }))
          .sort((a, b) =>
            a.alreadyPaid === b.alreadyPaid
              ? a.distanceDays - b.distanceDays
              : a.alreadyPaid - b.alreadyPaid,
          ),
      };
    }),

  link: protectedProcedure
    .input(z.object({ investmentId: z.string(), statementId: z.string(), amount }))
    .mutation(async ({ ctx, input }) => {
      const investment = await getOwnedInvestment(ctx.db, ctx.user.id, input.investmentId);
      const statement = await getOwnedStatement(ctx.db, ctx.user.id, input.statementId);
      const total = Math.abs(Number(statement.amount));
      if (Number(statement.amount) >= 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only outgoing payments can fund an investment',
        });
      }
      const allocated = (await allocatedByStatement(ctx.db, [statement.id])).get(statement.id) ?? 0;
      const value = Number(input.amount);
      if (value <= 0 || value > total - allocated + PAISA) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Only ${roundCurrency(total - allocated)} of this payment is left to link`,
        });
      }
      return ctx.db
        .insert(investmentPayments)
        .values({
          userId: ctx.user.id,
          investmentId: investment.id,
          statementId: statement.id,
          amount: roundCurrency(value).toFixed(2),
        })
        .onConflictDoUpdate({
          target: [investmentPayments.investmentId, investmentPayments.statementId],
          set: { amount: sql`${investmentPayments.amount} + excluded.amount` },
        })
        .returning({ id: investmentPayments.id });
    }),

  unlink: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .delete(investmentPayments)
        .where(and(eq(investmentPayments.id, input.id), eq(investmentPayments.userId, ctx.user.id)))
        .returning({ id: investmentPayments.id });
    }),
});
