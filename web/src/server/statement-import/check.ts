import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { statementImports } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';

import {
  accountLinks,
  accountRange,
  accountRecords,
  checkOf,
  explainedRows,
  loadLedger,
  reconcileChain,
} from './review';

const STALE_AFTER_MS = 600_000;

export const refreshAccountChecks = instrumentedFunction(
  'refreshAccountChecks',
  async (db: Database, userId: string, accountId: string, timeZone: string) => {
    const records = (await accountRecords(db, accountId)).filter(
      (record) => record.userId === userId,
    );
    if (records.length === 0) {
      return 0;
    }
    const [ledger, links] = await Promise.all([
      loadLedger(db, userId, accountId, accountRange(records), timeZone),
      accountLinks(db, accountId),
    ]);
    const chain = reconcileChain(records, ledger, links);
    const checks = records.flatMap((record) => {
      const entry = chain.get(record.id);
      if (entry === undefined) {
        return [];
      }
      const explained = explainedRows(record, records, chain, ledger);
      return [
        {
          id: record.id,
          check: checkOf(entry.result, record, ledger, {
            elsewhere: new Set(explained.elsewhere.keys()),
            likelyNext: explained.likelyNext,
          }),
        },
      ];
    });
    if (checks.length > 0) {
      const values = sql.join(
        checks.map(({ id, check }) => sql`(${id}::uuid, ${JSON.stringify(check)}::jsonb)`),
        sql`, `,
      );
      await db.execute(sql`
        UPDATE ${statementImports}
        SET "check" = updates.payload
        FROM (VALUES ${values}) AS updates(id, payload)
        WHERE ${statementImports.id} = updates.id
      `);
    }
    return checks.length;
  },
);

export const refreshStaleChecks = instrumentedFunction(
  'refreshStaleChecks',
  async (db: Database, userId: string, timeZone: string) => {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const stale = await db
      .selectDistinct({ accountId: statementImports.accountId })
      .from(statementImports)
      .where(
        and(
          eq(statementImports.userId, userId),
          ne(statementImports.status, 'discarded'),
          sql`(${statementImports.check} IS NULL OR ${statementImports.check}->>'computedAt' < ${staleBefore})`,
        ),
      );
    let refreshed = 0;
    for (const { accountId } of stale) {
      refreshed += await refreshAccountChecks(db, userId, accountId, timeZone);
    }
    return refreshed;
  },
);

export const refreshChecksForImports = async (
  db: Database,
  userId: string,
  importIds: string[],
  timeZone: string,
) => {
  if (importIds.length === 0) {
    return;
  }
  const accounts = await db
    .selectDistinct({ accountId: statementImports.accountId })
    .from(statementImports)
    .where(and(eq(statementImports.userId, userId), inArray(statementImports.id, importIds)));
  for (const { accountId } of accounts) {
    await refreshAccountChecks(db, userId, accountId, timeZone);
  }
};
