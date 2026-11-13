import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { accountInterestRates, bankAccount, creditCardAccounts, statements } from '@/db/schema';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import {
  buildInterestRows,
  createBalanceLookup,
  type InterestCredit,
  type InterestPeriod,
  type InterestRow,
} from '@/lib/interest';

export type InterestAccount = {
  accountId: string;
  accountName: string;
  rates: { id: string; effectiveFrom: string; annualRate: number }[];
  rows: InterestRow[];
};

const interestCreditFilter = sql`(
  ${statements.additionalAttributes} ? 'interestPeriodStart'
  OR (
    (lower(${statements.category}) = 'interest'
      OR EXISTS (SELECT 1 FROM unnest(${statements.tags}) AS tag WHERE lower(tag) = 'interest'))
    AND NOT EXISTS (
      SELECT 1 FROM investment_payments payment WHERE payment.statement_id = ${statements.id}
    )
  )
)`;

const ISO_DAY_LENGTH = 10;

const nowUtc = sql`now() AT TIME ZONE 'UTC'`;

const localDay = (column: unknown, timeZone: string) =>
  sql<string>`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date::text`;

export const getInterestOverview = instrumentedFunction(
  'getInterestOverview',
  async (db: Database, userId: string, timeZone: string): Promise<InterestAccount[]> => {
    const [accounts, rates, credits, today] = await Promise.all([
      db
        .select({
          id: bankAccount.id,
          name: bankAccount.accountName,
          startingBalance: bankAccount.startingBalance,
        })
        .from(bankAccount)
        .leftJoin(creditCardAccounts, eq(creditCardAccounts.accountId, bankAccount.id))
        .where(and(eq(bankAccount.userId, userId), isNull(creditCardAccounts.id)))
        .orderBy(asc(bankAccount.accountName)),
      db
        .select()
        .from(accountInterestRates)
        .where(eq(accountInterestRates.userId, userId))
        .orderBy(asc(accountInterestRates.effectiveFrom)),
      db
        .select({
          id: statements.id,
          accountId: statements.accountId,
          amount: statements.amount,
          taxableAmount: statements.taxableAmount,
          creditedOn: localDay(statements.createdAt, timeZone),
          periodStart: sql<
            string | null
          >`${statements.additionalAttributes}->>'interestPeriodStart'`,
          periodEnd: sql<string | null>`${statements.additionalAttributes}->>'interestPeriodEnd'`,
        })
        .from(statements)
        .where(
          and(
            eq(statements.userId, userId),
            eq(statements.statementKind, 'outside_transaction'),
            sql`${statements.amount} > 0`,
            interestCreditFilter,
          ),
        ),
      db.execute<{ today: string }>(sql`SELECT ${localDay(nowUtc, timeZone)} AS today`),
    ]);

    const todayDay = today.rows[0]?.today ?? new Date().toISOString().slice(0, ISO_DAY_LENGTH);
    const tracked = accounts.filter(
      (account) =>
        rates.some((rate) => rate.accountId === account.id) ||
        credits.some((credit) => credit.accountId === account.id),
    );
    const trackedIds = tracked.map((account) => account.id);
    const idList = sql.join(
      trackedIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const movements =
      trackedIds.length === 0
        ? { rows: [] }
        : await db.execute<{ account_id: string; day: string; amount: string }>(sql`
            SELECT account_id, day, SUM(amount)::text AS amount FROM (
              SELECT s.account_id, ${localDay(sql`s.created_at`, timeZone)} AS day,
                     CASE WHEN s."statementKind" = 'expense' THEN -s.amount ELSE s.amount END AS amount
              FROM statements s
              WHERE s.user_id = ${userId} AND s.account_id IN (${idList})
              UNION ALL
              SELECT t.to_account_id, ${localDay(sql`t.created_at`, timeZone)}, t.amount
              FROM self_transfer_statements t
              WHERE t.user_id = ${userId} AND t.to_account_id IN (${idList})
              UNION ALL
              SELECT t.from_account_id, ${localDay(sql`t.created_at`, timeZone)}, -t.amount
              FROM self_transfer_statements t
              WHERE t.user_id = ${userId} AND t.from_account_id IN (${idList})
            ) movement
            GROUP BY account_id, day
          `);

    return accounts.map((account) => {
      const accountRates = rates
        .filter((rate) => rate.accountId === account.id)
        .map((rate) => ({
          id: rate.id,
          effectiveFrom: rate.effectiveFrom,
          annualRate: Number(rate.annualRate),
        }));
      const accountCredits: InterestCredit[] = credits
        .filter((credit) => credit.accountId === account.id)
        .map((credit) => ({
          statementId: credit.id,
          creditedOn: credit.creditedOn,
          amount: Number(credit.amount),
          taxableAmount: credit.taxableAmount === null ? null : Number(credit.taxableAmount),
          period:
            credit.periodStart === null || credit.periodEnd === null
              ? null
              : { start: credit.periodStart, end: credit.periodEnd },
        }));
      const balanceOn = createBalanceLookup(
        Number(account.startingBalance),
        movements.rows
          .filter((row) => row.account_id === account.id)
          .map((row) => ({ day: row.day, amount: Number(row.amount) })),
      );
      return {
        accountId: account.id,
        accountName: account.name,
        rates: accountRates.toReversed(),
        rows: buildInterestRows({
          credits: accountCredits,
          rates: accountRates,
          balanceOn,
          today: todayDay,
        }),
      };
    });
  },
);

const assertAccount = async (db: Database, userId: string, accountId: string) => {
  const account = await db
    .select({ id: bankAccount.id })
    .from(bankAccount)
    .where(and(eq(bankAccount.id, accountId), eq(bankAccount.userId, userId)))
    .limit(1);
  if (account.length === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
  }
};

export const saveInterestRate = async (
  db: Database,
  userId: string,
  input: { accountId: string; effectiveFrom: string; annualRate: string },
) => {
  await assertAccount(db, userId, input.accountId);
  await db
    .insert(accountInterestRates)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: [accountInterestRates.accountId, accountInterestRates.effectiveFrom],
      set: { annualRate: input.annualRate },
    });
};

export const deleteInterestRate = async (db: Database, userId: string, rateId: string) => {
  await db
    .delete(accountInterestRates)
    .where(and(eq(accountInterestRates.id, rateId), eq(accountInterestRates.userId, userId)));
};

export const setInterestPeriods = async (
  db: Database,
  userId: string,
  entries: { statementId: string; period: InterestPeriod | null }[],
) => {
  const statementIds = entries.map((entry) => entry.statementId);
  const owned = await db
    .select({ id: statements.id })
    .from(statements)
    .where(
      and(
        eq(statements.userId, userId),
        inArray(statements.id, statementIds),
        eq(statements.statementKind, 'outside_transaction'),
        sql`${statements.amount} > 0`,
      ),
    );
  if (owned.length !== new Set(statementIds).size) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Only incoming outside transactions can be marked as interest',
    });
  }
  await db.transaction(async (tx) => {
    for (const entry of entries) {
      const attributes =
        entry.period === null
          ? sql`${statements.additionalAttributes} - 'interestPeriodStart' - 'interestPeriodEnd'`
          : sql`${statements.additionalAttributes} || ${JSON.stringify({
              interestPeriodStart: entry.period.start,
              interestPeriodEnd: entry.period.end,
            })}::jsonb`;
      await tx
        .update(statements)
        .set({ additionalAttributes: attributes })
        .where(and(eq(statements.userId, userId), eq(statements.id, entry.statementId)));
    }
  });
};
