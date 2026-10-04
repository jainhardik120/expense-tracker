import { and, desc, eq, sql } from 'drizzle-orm';

import { bankAccount, smsNotifications, statements } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';

const SPEND_TYPES = new Set(['expense', 'credit', 'investment']);

export type PendingAccountEstimate = {
  accountId: string | null;
  accountName: string;
  count: number;
  pendingSpend: number;
  pendingIncome: number;
  balanceNow: number | null;
  balanceAfter: number | null;
};

export type PendingEstimate = {
  count: number;
  totalSpend: number;
  totalIncome: number;
  oldest: Date | null;
  byAccount: PendingAccountEstimate[];
};

export const getPendingSmsEstimate = instrumentedFunction(
  'getPendingSmsEstimate',
  async (db: Database, userId: string): Promise<PendingEstimate> => {
    const pending = await db
      .select({
        id: smsNotifications.id,
        amount: smsNotifications.amount,
        type: smsNotifications.type,
        bankName: smsNotifications.bankName,
        accountLast4: smsNotifications.accountLast4,
        createdAt: smsNotifications.createdAt,
      })
      .from(smsNotifications)
      .where(and(eq(smsNotifications.userId, userId), eq(smsNotifications.status, 'pending')))
      .orderBy(desc(smsNotifications.createdAt));

    if (pending.length === 0) {
      return { count: 0, totalSpend: 0, totalIncome: 0, oldest: null, byAccount: [] };
    }

    const history = await db
      .select({
        bankName: smsNotifications.bankName,
        accountLast4: smsNotifications.accountLast4,
        accountId: statements.accountId,
        accountName: bankAccount.accountName,
        uses: sql<number>`count(*)::int`,
      })
      .from(smsNotifications)
      .innerJoin(
        statements,
        eq(
          sql`CAST(${smsNotifications.additionalAttributes}->>'statementId' AS uuid)`,
          statements.id,
        ),
      )
      .innerJoin(bankAccount, eq(bankAccount.id, statements.accountId))
      .where(
        and(
          eq(smsNotifications.userId, userId),
          eq(statements.userId, userId),
          eq(bankAccount.userId, userId),
        ),
      )
      .groupBy(
        smsNotifications.bankName,
        smsNotifications.accountLast4,
        statements.accountId,
        bankAccount.accountName,
      )
      .orderBy(desc(sql`count(*)`));

    const byLast4 = new Map<string, { id: string; name: string }>();
    const byBank = new Map<string, { id: string; name: string }>();
    for (const row of history) {
      if (row.accountId === null) {
        continue;
      }
      const entry = { id: row.accountId, name: row.accountName };
      if (row.accountLast4 !== null && !byLast4.has(row.accountLast4)) {
        byLast4.set(row.accountLast4, entry);
      }
      if (!byBank.has(row.bankName)) {
        byBank.set(row.bankName, entry);
      }
    }

    const groups = new Map<string, PendingAccountEstimate>();
    let totalSpend = 0;
    let totalIncome = 0;

    for (const message of pending) {
      const guess =
        (message.accountLast4 === null ? undefined : byLast4.get(message.accountLast4)) ??
        byBank.get(message.bankName);
      const key = guess?.id ?? `unknown:${message.bankName}`;
      const group = groups.get(key) ?? {
        accountId: guess?.id ?? null,
        accountName: guess?.name ?? `${message.bankName} (unmatched)`,
        count: 0,
        pendingSpend: 0,
        pendingIncome: 0,
        balanceNow: null,
        balanceAfter: null,
      };
      const amount = Number(message.amount);
      if (SPEND_TYPES.has(message.type)) {
        group.pendingSpend += amount;
        totalSpend += amount;
      } else if (message.type === 'income') {
        group.pendingIncome += amount;
        totalIncome += amount;
      }
      group.count += 1;
      groups.set(key, group);
    }

    return {
      count: pending.length,
      totalSpend,
      totalIncome,
      oldest: pending[pending.length - 1].createdAt,
      byAccount: [...groups.values()].sort((a, b) => b.pendingSpend - a.pendingSpend),
    };
  },
);
