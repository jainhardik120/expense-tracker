import { isSelfTransfer, type SelfTransferStatement, type Statement } from '@/types';

type StatementKindKey = 'expense' | 'outside_transaction' | 'friend_transaction' | 'self_transfer';

const kindClassNames: Record<StatementKindKey, string> = {
  expense: 'text-muted-foreground',
  outside_transaction: 'text-amber-600 dark:text-amber-400',
  friend_transaction: 'text-violet-600 dark:text-violet-400',
  self_transfer: 'text-sky-600 dark:text-sky-400',
};

const getStatementKindKey = (statement: Statement | SelfTransferStatement): StatementKindKey =>
  isSelfTransfer(statement) ? 'self_transfer' : (statement.statementKind as StatementKindKey);

export const statementKindClassName = (statement: Statement | SelfTransferStatement): string =>
  kindClassNames[getStatementKindKey(statement)];

export const hasSignedAmount = (statement: Statement | SelfTransferStatement): boolean =>
  !isSelfTransfer(statement) &&
  (statement.statementKind === 'outside_transaction' ||
    statement.statementKind === 'friend_transaction');

export const signedAmountClassName = (value: number): string =>
  value < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
