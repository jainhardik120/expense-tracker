import { Decimal } from 'decimal.js';
import { eq, sql } from 'drizzle-orm';

import { type balanceCheckSources } from '@/db/enums';
import { bankAccount, creditCardAccounts } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';

const MATCH_TOLERANCE = 0.005;

const movementsUntil = (accountColumn: string, timeExpression: string) =>
  sql.raw(`(
    COALESCE((
      SELECT SUM(CASE WHEN s."statementKind" = 'expense' THEN -s.amount ELSE s.amount END)
      FROM visible_statements s
      WHERE s.account_id = ${accountColumn} AND s.created_at <= ${timeExpression}
    ), 0)
    + COALESCE((
      SELECT SUM(CASE WHEN t.to_account_id = ${accountColumn} THEN t.amount ELSE -t.amount END)
      FROM self_transfer_statements t
      WHERE t.user_id = b.user_id
        AND (t.from_account_id = ${accountColumn} OR t.to_account_id = ${accountColumn})
        AND t.created_at <= ${timeExpression}
    ), 0)
  )`);

type CheckRow = {
  id: string;
  account_id: string;
  checked_at: Date;
  balance: string;
  note: string | null;
  source: (typeof balanceCheckSources)[number];
  computed: string;
};

type BalanceCheck = {
  id: string;
  checkedAt: Date;
  balance: number;
  computed: number;
  difference: number;
  unexplainedSincePrevious: number;
  matches: boolean;
  note: string | null;
  source: (typeof balanceCheckSources)[number];
};

type AccountBalanceStatus = 'unchecked' | 'matched' | 'mismatch';

type AccountBalanceChecks = {
  accountId: string;
  accountName: string;
  isCreditCard: boolean;
  balanceNow: number;
  correctedBalanceNow: number | null;
  status: AccountBalanceStatus;
  latestDifference: number;
  mismatchedChecks: number;
  checks: BalanceCheck[];
};

const matches = (value: Decimal) => value.abs().lessThan(MATCH_TOLERANCE);

export const getBalanceChecks = instrumentedFunction(
  'getBalanceChecks',
  async (db: Database, userId: string): Promise<AccountBalanceChecks[]> => {
    const [accounts, cards, checks] = await Promise.all([
      db.execute<{ id: string; account_name: string; balance_now: string }>(sql`
        SELECT b.id, b.account_name,
               b.starting_balance + ${movementsUntil('b.id', "(now() AT TIME ZONE 'UTC')")} AS balance_now
        FROM bank_account b
        WHERE b.user_id = ${userId}
        ORDER BY b.account_name
      `),
      db
        .select({ accountId: creditCardAccounts.accountId })
        .from(creditCardAccounts)
        .innerJoin(bankAccount, eq(bankAccount.id, creditCardAccounts.accountId))
        .where(eq(bankAccount.userId, userId)),
      db.execute<CheckRow>(sql`
        SELECT c.id, c.account_id, c.checked_at, c.balance, c.note, c.source,
               b.starting_balance + ${movementsUntil('c.account_id', 'c.checked_at')} AS computed
        FROM account_balance_checks c
        JOIN bank_account b ON b.id = c.account_id
        WHERE c.user_id = ${userId}
        ORDER BY c.account_id, c.checked_at
      `),
    ]);
    const cardIds = new Set(cards.map((card) => card.accountId));
    return accounts.rows.map((account) => {
      let previousDifference = new Decimal(0);
      const accountChecks = checks.rows
        .filter((row) => row.account_id === account.id)
        .map((row): BalanceCheck => {
          const balance = new Decimal(row.balance);
          const computed = new Decimal(row.computed);
          const difference = balance.minus(computed).toDecimalPlaces(2);
          const unexplained = difference.minus(previousDifference).toDecimalPlaces(2);
          previousDifference = difference;
          return {
            id: row.id,
            checkedAt: new Date(row.checked_at),
            balance: balance.toNumber(),
            computed: computed.toNumber(),
            difference: difference.toNumber(),
            unexplainedSincePrevious: unexplained.toNumber(),
            matches: matches(difference),
            note: row.note,
            source: row.source,
          };
        });
      const latest = accountChecks.at(-1);
      const balanceNow = new Decimal(account.balance_now);
      const mismatchedChecks = accountChecks.filter((check) => !check.matches).length;
      let status: AccountBalanceStatus = 'unchecked';
      if (latest !== undefined) {
        status = mismatchedChecks === 0 ? 'matched' : 'mismatch';
      }
      return {
        accountId: account.id,
        accountName: account.account_name,
        isCreditCard: cardIds.has(account.id),
        balanceNow: balanceNow.toNumber(),
        correctedBalanceNow:
          latest === undefined ? null : balanceNow.plus(latest.difference).toNumber(),
        status,
        latestDifference: latest?.difference ?? 0,
        mismatchedChecks,
        checks: accountChecks.toReversed(),
      };
    });
  },
);
