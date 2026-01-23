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

import { bankAccount, creditCardAccounts, emis, recurringPayments, statements } from '@/db/schema';
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

export const getRecurringPayment = async (
  db: Database,
  userId: string,
  recurringPaymentId: string,
) => {
  const recurringPaymentData = await db
    .select()
    .from(recurringPayments)
    .where(and(eq(recurringPayments.id, recurringPaymentId), eq(recurringPayments.userId, userId)))
    .limit(1);

  if (recurringPaymentData.length === 0) {
    throw new Error('Recurring payment not found or access denied');
  }
  return recurringPaymentData[0];
};

export const getLinkedStatementsRecurringPayment = async (
  db: Database,
  userId: string,
  recurringPaymentId: string,
) =>
  db
    .select({
      id: statements.id,
      accountId: statements.accountId,
      friendId: statements.friendId,
      amount: statements.amount,
      category: statements.category,
      tags: statements.tags,
      statementKind: statements.statementKind,
      createdAt: statements.createdAt,
      attributes: statements.additionalAttributes,
    })
    .from(statements)
    .where(
      and(
        eq(statements.userId, userId),
        eq(sql`${statements.additionalAttributes}->>'recurringPaymentId'`, recurringPaymentId),
      ),
    )
    .orderBy(desc(statements.createdAt));

export const verifyCreditCardAccount = async (db: Database, userId: string, creditId: string) => {
  const creditCard = await db
    .select({ id: creditCardAccounts.id })
    .from(creditCardAccounts)
    .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
    .where(and(eq(creditCardAccounts.id, creditId), eq(bankAccount.userId, userId)))
    .limit(1);

  if (creditCard.length === 0) {
    throw new Error('Credit card not found or access denied');
  }
};

export const getStatementAttributes = async (db: Database, userId: string, statementId: string) => {
  const statement = await db
    .select({
      id: statements.id,
      accountId: statements.accountId,
      attributes: statements.additionalAttributes,
      amount: statements.amount,
      createdAt: statements.createdAt,
      statementKind: statements.statementKind,
    })
    .from(statements)
    .where(and(eq(statements.id, statementId), eq(statements.userId, userId)))
    .limit(1);
  if (statement.length === 0) {
    throw new Error('Statement not found or access denied');
  }
  return statement[0];
};

export const getEMIData = async (db: Database, userId: string, emiId: string) => {
  const emiData = await db
    .select({
      accountId: creditCardAccounts.accountId,
      ...getTableColumns(emis),
    })
    .from(emis)
    .leftJoin(creditCardAccounts, eq(emis.creditId, creditCardAccounts.id))
    .where(and(eq(emis.id, emiId), eq(emis.userId, userId)))
    .limit(1);
  if (emiData.length === 0) {
    throw new Error('EMI not found or access denied');
  }
  return emiData[0];
};
