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

export const getLinkedHistory = instrumentedFunction(
  'getLinkedHistory',
  async (db: Database, userId: string): Promise<LinkedHistoryEntry[]> =>
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
      .orderBy(desc(smsNotifications.createdAt)),
);

export const getInsertHintsForMany = instrumentedFunction(
  'getInsertHintsForMany',
  async (
    db: Database,
    userId: string,
    subjects: HintSubject[],
  ): Promise<Map<string, InsertHints>> =>
    buildInsertHints(await getLinkedHistory(db, userId), subjects),
);

export const getInsertHintsForOne = instrumentedFunction(
  'getInsertHintsForOne',
  async (db: Database, userId: string, subject: HintSubject): Promise<InsertHints> => {
    const hintsById = await getInsertHintsForMany(db, userId, [subject]);
    return getHintsFor(hintsById, subject.id);
  },
);

export const getHintSubject = instrumentedFunction(
  'getHintSubject',
  async (db: Database, userId: string, id: string): Promise<HintSubject> => {
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
  },
);
