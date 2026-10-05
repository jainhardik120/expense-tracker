import { roundMoney } from './pdf/values';
import { type IssuerStatement, type ParsedStatement } from './types';

const RECONCILE_TOLERANCE = 0.01;

const sumOf = (rows: IssuerStatement['transactions'], direction: 'debit' | 'credit') =>
  roundMoney(
    rows.filter((row) => row.direction === direction).reduce((sum, row) => sum + row.amount, 0),
  );

export const finalizeStatement = (statement: IssuerStatement): ParsedStatement => {
  const billed =
    statement.declared === null
      ? statement.transactions
      : statement.transactions.filter((row) => row.emi === null);
  const debits = sumOf(billed, 'debit');
  const credits = sumOf(billed, 'credit');
  const reconciliation =
    statement.declared === null
      ? null
      : {
          debitsDifference: roundMoney(debits - statement.declared.debits),
          creditsDifference: roundMoney(credits - statement.declared.credits),
        };
  const movement = statement.kind === 'credit_card' ? debits - credits : credits - debits;
  const balanceCheck =
    statement.openingBalance === null || statement.closingBalance === null
      ? null
      : {
          expected: roundMoney(statement.openingBalance + movement),
          actual: statement.closingBalance,
          difference: roundMoney(statement.closingBalance - (statement.openingBalance + movement)),
        };
  return { ...statement, totals: { debits, credits }, reconciliation, balanceCheck };
};

export const isReconciled = (statement: ParsedStatement) =>
  statement.reconciliation !== null &&
  Math.abs(statement.reconciliation.debitsDifference) < RECONCILE_TOLERANCE &&
  Math.abs(statement.reconciliation.creditsDifference) < RECONCILE_TOLERANCE;
