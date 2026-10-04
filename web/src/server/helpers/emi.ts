import {
  and,
  asc,
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
  count,
  isNull,
} from 'drizzle-orm';

import { bankAccount, creditCardAccounts, emis, recurringPayments, statements } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
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

const emiListFilter = (db: Database, userId: string, input: z.infer<typeof emiParserSchema>) => {
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
          isNull(maxInstallmentSubquery.maxInstallmentNo),
        ),
      );
    }
  }
  return { maxInstallmentSubquery, where: and(...conditions) };
};

export const getEMIs = instrumentedFunction(
  'getEMIs',
  async (db: Database, userId: string, input: z.infer<typeof emiParserSchema>) => {
    const { maxInstallmentSubquery, where } = emiListFilter(db, userId, input);
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
      .where(where)
      .orderBy(
        sql`(${maxInstallmentSubquery.maxInstallmentNo} IS NOT NULL AND ${maxInstallmentSubquery.maxInstallmentNo} = ${emis.tenure}) ASC`,
        asc(emis.name),
      )
      .limit(input.perPage)
      .offset((input.page - 1) * input.perPage);
  },
);

export const countEMIs = instrumentedFunction(
  'countEMIs',
  async (db: Database, userId: string, input: z.infer<typeof emiParserSchema>) => {
    const { maxInstallmentSubquery, where } = emiListFilter(db, userId, input);
    const [{ total }] = await db
      .select({ total: count() })
      .from(emis)
      .innerJoin(creditCardAccounts, eq(emis.creditId, creditCardAccounts.id))
      .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
      .leftJoin(maxInstallmentSubquery, eq(sql`${emis.id}::text`, maxInstallmentSubquery.emiId))
      .where(where);
    return total;
  },
);

export const getRecurringPayment = instrumentedFunction(
  'getRecurringPayment',
  async (db: Database, userId: string, recurringPaymentId: string) => {
    const recurringPaymentData = await db
      .select()
      .from(recurringPayments)
      .where(
        and(eq(recurringPayments.id, recurringPaymentId), eq(recurringPayments.userId, userId)),
      )
      .limit(1);

    if (recurringPaymentData.length === 0) {
      throw new Error('Recurring payment not found or access denied');
    }
    return recurringPaymentData[0];
  },
);

export const getLinkedStatementsRecurringPayment = instrumentedFunction(
  'getLinkedStatementsRecurringPayment',
  async (db: Database, userId: string, recurringPaymentId: string) =>
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
      .orderBy(desc(statements.createdAt)),
);

export const verifyCreditCardAccount = instrumentedFunction(
  'verifyCreditCardAccount',
  async (db: Database, userId: string, creditId: string) => {
    const creditCard = await db
      .select({ id: creditCardAccounts.id })
      .from(creditCardAccounts)
      .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
      .where(and(eq(creditCardAccounts.id, creditId), eq(bankAccount.userId, userId)))
      .limit(1);

    if (creditCard.length === 0) {
      throw new Error('Credit card not found or access denied');
    }
  },
);

const selectStatementAttributes = (db: Database, userId: string, statementId: string) =>
  db
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
    .limit(1)
    .$dynamic();

const requireStatement = <T>(rows: T[]): T => {
  if (rows.length === 0) {
    throw new Error('Statement not found or access denied');
  }
  return rows[0];
};

export const getStatementAttributes = instrumentedFunction(
  'getStatementAttributes',
  async (db: Database, userId: string, statementId: string) =>
    requireStatement(await selectStatementAttributes(db, userId, statementId)),
);

export const lockStatementAttributes = instrumentedFunction(
  'lockStatementAttributes',
  async (db: Database, userId: string, statementId: string) =>
    requireStatement(await selectStatementAttributes(db, userId, statementId).for('update')),
);

const selectEMIData = (db: Database, userId: string, emiId: string) =>
  db
    .select({
      accountId: creditCardAccounts.accountId,
      ...getTableColumns(emis),
    })
    .from(emis)
    .leftJoin(creditCardAccounts, eq(emis.creditId, creditCardAccounts.id))
    .where(and(eq(emis.id, emiId), eq(emis.userId, userId)))
    .limit(1)
    .$dynamic();

const requireEMI = <T>(rows: T[]): T => {
  if (rows.length === 0) {
    throw new Error('EMI not found or access denied');
  }
  return rows[0];
};

export const getEMIData = instrumentedFunction(
  'getEMIData',
  async (db: Database, userId: string, emiId: string) =>
    requireEMI(await selectEMIData(db, userId, emiId)),
);

export const lockEMIData = instrumentedFunction(
  'lockEMIData',
  async (db: Database, userId: string, emiId: string) =>
    requireEMI(await selectEMIData(db, userId, emiId).for('update', { of: emis })),
);
