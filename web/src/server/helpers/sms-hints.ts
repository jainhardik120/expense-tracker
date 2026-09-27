import { and, desc, eq, sql } from 'drizzle-orm';

import { smsNotifications, statements } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import {
  buildInsertHints,
  getHintsFor,
  type HintSubject,
  type InsertHints,
  type LinkedHistoryEntry,
} from '@/lib/sms-insert-hints';

/**
 * Every message that has already been entered, newest first, paired with the
 * statement it became.
 *
 * This is the whole training set for the hints, and it is small — one row per
 * message ever filed — so it is cheaper to read once and key it in memory than
 * to ask the database per key. The pool runs at a single connection, which makes
 * a round trip per key expensive in a way a bigger pool would hide.
 */
export const getLinkedHistory = async (db: Database, userId: string): Promise<LinkedHistoryEntry[]> =>
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

/** Hints for a whole queue of messages, resolved from one read of the history. */
export const getInsertHintsForMany = instrumentedFunction(
  'getInsertHintsForMany',
  async (
    db: Database,
    userId: string,
    subjects: HintSubject[],
  ): Promise<Map<string, InsertHints>> =>
    buildInsertHints(await getLinkedHistory(db, userId), subjects),
);

/**
 * Hints for one message.
 *
 * Deliberately the same code path as the bulk grid rather than its own set of
 * queries. When the two were separate they disagreed on ties — the SQL left the
 * winner to Postgres, which picked the older of two equally-used tags — and any
 * later change to how a hint is chosen would have had to be made twice.
 */
export const getInsertHintsForOne = instrumentedFunction(
  'getInsertHintsForOne',
  async (db: Database, userId: string, subject: HintSubject): Promise<InsertHints> => {
    const hintsById = await getInsertHintsForMany(db, userId, [subject]);
    return getHintsFor(hintsById, subject.id);
  },
);

/** The fields a pending message contributes to its own hint. */
export const getHintSubject = async (
  db: Database,
  userId: string,
  id: string,
): Promise<HintSubject> => {
  const found = await db
    .select({
      id: smsNotifications.id,
      bankName: smsNotifications.bankName,
      accountLast4: smsNotifications.accountLast4,
      merchant: smsNotifications.merchant,
    })
    .from(smsNotifications)
    .where(and(eq(smsNotifications.id, id), eq(smsNotifications.userId, userId)))
    .limit(1);
  const subject = found.at(0);
  if (subject === undefined) {
    throw new Error('SMS notification not found');
  }
  return subject;
};
