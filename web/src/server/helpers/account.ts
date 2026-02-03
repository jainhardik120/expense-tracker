import { and, eq } from 'drizzle-orm';

import { bankAccount, creditCardAccounts, friendsProfiles } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { type SelfTransferStatement, type Statement, isSelfTransfer } from '@/types';

export const getAccounts = (db: Database, userId: string) =>
  db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.userId, userId))
    .orderBy(bankAccount.accountName);

export const getFriends = (db: Database, userId: string) =>
  db
    .select()
    .from(friendsProfiles)
    .where(eq(friendsProfiles.userId, userId))
    .orderBy(friendsProfiles.name);

export const getFromAccount = (statement: Statement | SelfTransferStatement): string | null => {
  if (isSelfTransfer(statement)) {
    return statement.fromAccount;
  }
  switch (statement.statementKind) {
    case 'expense':
      return statement.accountName ?? statement.friendName;
    case 'friend_transaction':
      return Number.parseFloat(statement.amount) < 0 ? statement.accountName : statement.friendName;
    case 'outside_transaction':
      return Number.parseFloat(statement.amount) < 0 ? statement.accountName : null;
    case 'self_transfer':
      return null;
    default:
      return null;
  }
};

export const getToAccount = (statement: Statement | SelfTransferStatement): string | null => {
  if (isSelfTransfer(statement)) {
    return statement.toAccount;
  }
  switch (statement.statementKind) {
    case 'expense':
      return null;
    case 'friend_transaction':
      return Number.parseFloat(statement.amount) < 0 ? statement.friendName : statement.accountName;
    case 'outside_transaction':
      return Number.parseFloat(statement.amount) < 0 ? null : statement.accountName;
    case 'self_transfer':
      return null;
    default:
      return null;
  }
};

export const friendBelongToUser = instrumentedFunction(
  'friendBelongToUser',
  async (friendId: string, userId: string, db: Database) => {
    const friend = await db
      .select()
      .from(friendsProfiles)
      .where(and(eq(friendsProfiles.id, friendId), eq(friendsProfiles.userId, userId)))
      .limit(1);
    return friend.length > 0;
  },
);

export const accountBelongToUser = instrumentedFunction(
  'accountBelongToUser',
  async (accountId: string, userId: string, db: Database) => {
    const account = await db
      .select()
      .from(bankAccount)
      .where(and(eq(bankAccount.id, accountId), eq(bankAccount.userId, userId)))
      .limit(1);
    return account.length > 0;
  },
);

export const getCreditCards = instrumentedFunction(
  'getCreditCards',
  async (db: Database, userId: string) => {
    return db
      .select({
        id: creditCardAccounts.id,
        accountId: creditCardAccounts.accountId,
        cardLimit: creditCardAccounts.cardLimit,
        accountName: bankAccount.accountName,
      })
      .from(creditCardAccounts)
      .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
      .where(eq(bankAccount.userId, userId));
  },
);
