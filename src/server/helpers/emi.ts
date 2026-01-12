import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  lt,
  max,
  or,
  sql,
  sum,
  type SQL,
} from 'drizzle-orm';

import { bankAccount, creditCardAccounts, emis, statements } from '@/db/schema';
import { type Database } from '@/lib/db';
import type { emiParserSchema } from '@/types';

import type { z } from 'zod';

export const getMaxInstallmentNoSubquery = (db: Database, userId: string) =>
  db
    .select({
      emiId: sql<string>`(${statements.additionalAttributes}->>'emiId')`.as('emi_id'),
      maxInstallmentNo: max(
        sql<number>`CAST(${statements.additionalAttributes}->>'installmentNo' AS INTEGER)`,
      ).as('max_installment_no'),
      totalPaid: sum(sql<number>`ABS(${statements.amount})`).as('total_paid'),
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

export const getEMIs = async (
  db: Database,
  userId: string,
  input: z.infer<typeof emiParserSchema>,
) => {
  const maxInstallmentSubquery = getMaxInstallmentNoSubquery(db, userId);

  const conditions: (SQL<unknown> | undefined)[] = [eq(emis.userId, userId)];
  if (input.accountId.length > 0) {
    conditions.push(inArray(creditCardAccounts.accountId, input.accountId));
  }
  if (input.creditId.length > 0) {
    conditions.push(inArray(creditCardAccounts.id, input.creditId));
  }
  if (input.completed !== undefined) {
    if (input.completed === true) {
      conditions.push(eq(maxInstallmentSubquery.maxInstallmentNo, emis.tenure));
    } else {
      conditions.push(
        or(
          lt(maxInstallmentSubquery.maxInstallmentNo, emis.tenure),
          sql`${maxInstallmentSubquery.maxInstallmentNo} IS NULL`,
        ),
      );
    }
  }
  return db
    .select({
      creditCardName: bankAccount.accountName,
      ...getTableColumns(emis),
      maxInstallmentNo: maxInstallmentSubquery.maxInstallmentNo,
      totalPaid: maxInstallmentSubquery.totalPaid,
    })
    .from(emis)
    .innerJoin(creditCardAccounts, eq(emis.creditId, creditCardAccounts.id))
    .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
    .leftJoin(maxInstallmentSubquery, eq(sql`${emis.id}::text`, maxInstallmentSubquery.emiId))
    .where(and(...conditions))
    .orderBy(desc(emis.createdAt))
    .limit(input.perPage)
    .offset((input.page - 1) * input.perPage);
};
