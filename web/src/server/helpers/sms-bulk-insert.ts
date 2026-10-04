import { randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { bankAccount, friendsProfiles, smsNotifications, statements } from '@/db/schema';
import { withZonedDatePart } from '@/lib/date-part';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import {
  buildInitialRow,
  type BulkImportFields,
  type BulkImportRow,
  getFieldsProblem,
  parseGridDate,
  type SmsType,
} from '@/lib/sms-bulk-import';
import { buildInsertHints, collectTagVocabulary, getHintsFor } from '@/lib/sms-insert-hints';
import { getLinkedHistory } from '@/server/helpers/sms-hints';

export type BulkImportQueue = {
  rows: BulkImportRow[];
  tagOptions: string[];
};

export const getBulkImportRows = instrumentedFunction(
  'getBulkImportRows',
  async (db: Database, userId: string, timeZone: string): Promise<BulkImportQueue> => {
    const pending = await db
      .select({
        id: smsNotifications.id,
        amount: smsNotifications.amount,
        type: smsNotifications.type,
        merchant: smsNotifications.merchant,
        bankName: smsNotifications.bankName,
        accountLast4: smsNotifications.accountLast4,
        currency: smsNotifications.currency,
        createdAt: smsNotifications.createdAt,
      })
      .from(smsNotifications)
      .where(and(eq(smsNotifications.userId, userId), eq(smsNotifications.status, 'pending')))
      .orderBy(desc(smsNotifications.createdAt));

    if (pending.length === 0) {
      return { rows: [], tagOptions: [] };
    }

    const history = await getLinkedHistory(db, userId);
    const hintsById = buildInsertHints(history, pending);

    return {
      rows: pending.map((notification) =>
        buildInitialRow(
          { ...notification, type: notification.type as SmsType },
          getHintsFor(hintsById, notification.id),
          timeZone,
        ),
      ),
      tagOptions: collectTagVocabulary(history),
    };
  },
);

export type SubmittedRow = BulkImportFields & { id: string };

export type BulkInsertResult = {
  imported: number;
  stale: number;
};

const assertOwnership = async (
  db: Database,
  userId: string,
  rows: SubmittedRow[],
): Promise<void> => {
  const accountIds = [...new Set(rows.map((row) => row.accountId).filter((id) => id !== ''))];
  const friendIds = [...new Set(rows.map((row) => row.friendId).filter((id) => id !== ''))];

  const [ownedAccounts, ownedFriends] = await Promise.all([
    accountIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: bankAccount.id })
          .from(bankAccount)
          .where(and(eq(bankAccount.userId, userId), inArray(bankAccount.id, accountIds))),
    friendIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: friendsProfiles.id })
          .from(friendsProfiles)
          .where(and(eq(friendsProfiles.userId, userId), inArray(friendsProfiles.id, friendIds))),
  ]);

  if (ownedAccounts.length !== accountIds.length) {
    throw new Error('One of the accounts does not exist');
  }
  if (ownedFriends.length !== friendIds.length) {
    throw new Error('One of the friends does not exist');
  }
};

export const bulkInsertFromNotifications = instrumentedFunction(
  'bulkInsertFromNotifications',
  async (
    db: Database,
    userId: string,
    rows: SubmittedRow[],
    timeZone: string,
  ): Promise<BulkInsertResult> => {
    if (rows.length === 0) {
      throw new Error('Nothing to import');
    }

    const ids = rows.map((row) => row.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error('The same notification appears twice in one import');
    }

    for (const row of rows) {
      const problem = getFieldsProblem(row);
      if (problem !== null) {
        throw new Error(problem);
      }
    }

    await assertOwnership(db, userId, rows);

    return db.transaction(async (tx) => {
      const pending = await tx
        .select({ id: smsNotifications.id, createdAt: smsNotifications.createdAt })
        .from(smsNotifications)
        .where(
          and(
            eq(smsNotifications.userId, userId),
            eq(smsNotifications.status, 'pending'),
            inArray(smsNotifications.id, ids),
          ),
        );

      const timestampById = new Map(pending.map((row) => [row.id, row.createdAt]));
      const importable = rows.filter((row) => timestampById.has(row.id));

      if (importable.length === 0) {
        throw new Error('None of these are pending any more — reload to see where they ended up');
      }

      const linked = importable.map((row) => {
        const timestamp = timestampById.get(row.id);
        const day = parseGridDate(row.date);
        if (timestamp === undefined || day === null) {
          throw new Error(`Could not read the date "${row.date}"`);
        }
        return {
          statementId: randomUUID(),
          notificationId: row.id,
          row,
          createdAt: withZonedDatePart(timestamp, day, timeZone),
        };
      });

      await tx.insert(statements).values(
        linked.map(({ statementId, row, createdAt }) => ({
          id: statementId,
          userId,
          amount: row.amount.toString(),
          category: row.category.trim(),
          tags: row.tags,
          statementKind: row.statementKind,
          accountId: row.accountId === '' ? null : row.accountId,
          friendId: row.friendId === '' ? null : row.friendId,
          createdAt,
        })),
      );

      const pairs = sql.join(
        linked.map(
          ({ notificationId, statementId }) => sql`(${notificationId}::uuid, ${statementId}::text)`,
        ),
        sql`, `,
      );
      await tx.execute(sql`
        UPDATE ${smsNotifications} AS target
        SET status = 'inserted',
            additional_attributes = jsonb_build_object('statementId', source.statement_id)
        FROM (VALUES ${pairs}) AS source(notification_id, statement_id)
        WHERE target.id = source.notification_id
          AND target.user_id = ${userId}
      `);

      return { imported: linked.length, stale: rows.length - linked.length };
    });
  },
);
