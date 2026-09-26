import { isSelfTransfer, type SelfTransferStatement, type Statement } from '@/types';

type StatementKindKey = 'expense' | 'outside_transaction' | 'friend_transaction' | 'self_transfer';

// Expenses are most of the table, so they stay quiet; the rarer kinds each get
// their own hue. Deliberately not red or green — those are reserved for the
// sign of an amount, and reusing them here would make the two readings clash.
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

// Only the kinds that can move money either way carry a signed amount; an
// expense or a self transfer is always stored positive, so colouring those
// green would read as income.
export const hasSignedAmount = (statement: Statement | SelfTransferStatement): boolean =>
  !isSelfTransfer(statement) &&
  (statement.statementKind === 'outside_transaction' ||
    statement.statementKind === 'friend_transaction');

export const signedAmountClassName = (value: number): string =>
  value < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
