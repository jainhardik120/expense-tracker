import { randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { bankAccount, friendsProfiles, smsNotifications, statements } from '@/db/schema';
import { withDatePart } from '@/lib/date-part';
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
import { buildInsertHints, getHintsFor, type LinkedHistoryEntry } from '@/lib/sms-insert-hints';

/**
 * Every message that has already been entered, newest first, paired with the
 * statement it became.
 *
 * This is the whole training set for the hints, and it is small — one row per
 * message ever filed — so it is cheaper to read once and key it in memory than
 * to ask the database per message. The pool runs at a single connection, which
 * makes a round trip per message expensive in a way a bigger pool would hide.
 */
const getLinkedHistory = async (db: Database, userId: string): Promise<LinkedHistoryEntry[]> =>
  db
    .select({
      bankName: smsNotifications.bankName,
      accountLast4: smsNotifications.accountLast4,
      merchant: smsNotifications.merchant,
      accountId: statements.accountId,
      category: statements.category,
      tags: statements.tags,
    })
    .from(smsNotifications)
    .innerJoin(
      statements,
      eq(
        sql`CAST(${smsNotifications.additionalAttributes}->>'statementId' AS uuid)`,
        statements.id,
      ),
    )
    .where(eq(smsNotifications.userId, userId))
    .orderBy(desc(smsNotifications.createdAt));

/**
 * The pending queue as grid rows, each pre-filled from how messages like it were
 * filed before. Two queries however long the queue is: the queue, and the
 * history the hints are drawn from.
 */
export const getBulkImportRows = instrumentedFunction(
  'getBulkImportRows',
  async (db: Database, userId: string): Promise<BulkImportRow[]> => {
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
      return [];
    }

    const hintsById = buildInsertHints(await getLinkedHistory(db, userId), pending);

    return pending.map((notification) =>
      buildInitialRow(
        { ...notification, type: notification.type as SmsType },
        getHintsFor(hintsById, notification.id),
      ),
    );
  },
);

/** A row as it arrives from the grid, already narrowed by the router's schema. */
export type SubmittedRow = BulkImportFields & { id: string };

export type BulkInsertResult = {
  imported: number;
  /** Rows dropped because the message stopped being pending while the grid sat open. */
  stale: number;
};

/**
 * Checks that every account and friend named by the rows is one of this user's.
 *
 * Two queries for the whole import rather than two per row, and it has to happen
 * before the insert: the foreign keys would accept another user's account id
 * quite happily.
 */
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

/**
 * Writes the reviewed rows as statements and marks the messages they came from
 * as entered.
 *
 * All of it or none of it. A half-written import would leave the user unable to
 * tell which messages still need attention, which is the problem this page
 * exists to solve.
 *
 * The notifications are re-read inside the transaction and anything no longer
 * pending is dropped, so a message entered by hand in another tab while the grid
 * sat open does not become a second statement for the same transaction.
 */
export const bulkInsertFromNotifications = instrumentedFunction(
  'bulkInsertFromNotifications',
  async (db: Database, userId: string, rows: SubmittedRow[]): Promise<BulkInsertResult> => {
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
        throw new Error(
          'None of these are pending any more — reload to see where they ended up',
        );
      }

      // The statement ids are chosen here rather than read back, so each message
      // can be pointed at its own statement without depending on the order rows
      // come back from a multi-row insert.
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
          // The grid only edits the calendar day; the time of day stays as the
          // moment the message arrived.
          createdAt: withDatePart(timestamp, day),
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

      // Each message remembers the statement it became. That link is the only
      // thing the hints for the next import are learned from, so it matters as
      // much as the statement itself.
      const pairs = sql.join(
        linked.map(
          ({ notificationId, statementId }) =>
            sql`(${notificationId}::uuid, ${statementId}::text)`,
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
