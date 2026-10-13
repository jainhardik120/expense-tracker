import { and, eq } from 'drizzle-orm';

import { smsNotifications } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';

const SPEND_TYPES = new Set(['expense', 'credit', 'investment']);

export type PendingEstimate = {
  count: number;
  totalSpend: number;
};

export const getPendingSmsEstimate = instrumentedFunction(
  'getPendingSmsEstimate',
  async (db: Database, userId: string): Promise<PendingEstimate> => {
    const pending = await db
      .select({ amount: smsNotifications.amount, type: smsNotifications.type })
      .from(smsNotifications)
      .where(and(eq(smsNotifications.userId, userId), eq(smsNotifications.status, 'pending')));

    return {
      count: pending.length,
      totalSpend: pending
        .filter((message) => SPEND_TYPES.has(message.type))
        .reduce((sum, message) => sum + Number(message.amount), 0),
    };
  },
);
