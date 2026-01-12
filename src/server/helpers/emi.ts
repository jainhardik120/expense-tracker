import { and, eq, lt, max, or, sql } from 'drizzle-orm';

import { emis, statements } from '@/db/schema';
import { type Database } from '@/lib/db';

export const getPendingEMIs = async (db: Database, userId: string) => {
  const maxInstallmentSubquery = db
    .select({
      emiId: sql<string>`(${statements.additionalAttributes}->>'emiId')`.as('emi_id'),
      maxInstallmentNo: max(
        sql<number>`CAST(${statements.additionalAttributes}->>'installmentNo' AS INTEGER)`,
      ).as('max_installment_no'),
    })
    .from(statements)
    .where(
      and(
        eq(statements.userId, userId),
        sql`${statements.additionalAttributes}->>'emiId' IS NOT NULL`,
      ),
    )
    .groupBy(sql`${statements.additionalAttributes}->>'emiId'`)
    .as('max_installments');

  return db
    .select({
      emi: emis,
      maxInstallmentNo: maxInstallmentSubquery.maxInstallmentNo,
    })
    .from(emis)
    .leftJoin(maxInstallmentSubquery, eq(sql`${emis.id}::text`, maxInstallmentSubquery.emiId))
    .where(
      and(
        eq(emis.userId, userId),
        or(
          sql`${maxInstallmentSubquery.maxInstallmentNo} IS NULL`,
          lt(maxInstallmentSubquery.maxInstallmentNo, emis.tenure),
        ),
      ),
    );
};
