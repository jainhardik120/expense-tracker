import { and, eq, inArray } from 'drizzle-orm';

import { bankAccount, creditCardAccounts, friendsProfiles } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { type SelfTransferStatement, type Statement, isSelfTransfer } from '@/types';

export const getAccounts = instrumentedFunction(
  'getAccounts',
  async (db: Database, userId: string) =>
    db
      .select()
      .from(bankAccount)
      .where(eq(bankAccount.userId, userId))
      .orderBy(bankAccount.accountName),
);

export const getFriends = instrumentedFunction('getFriends', async (db: Database, userId: string) =>
  db
    .select()
    .from(friendsProfiles)
    .where(eq(friendsProfiles.userId, userId))
    .orderBy(friendsProfiles.name),
);

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
    default:
      return null;
  }
};

const distinctIds = (ids: (string | null)[]) => [
  ...new Set(ids.filter((id): id is string => id !== null && id !== '')),
];

export const assertOwnsAccountsAndFriends = instrumentedFunction(
  'assertOwnsAccountsAndFriends',
  async (
    db: Database,
    userId: string,
    {
      accountIds = [],
      friendIds = [],
    }: { accountIds?: (string | null)[]; friendIds?: (string | null)[] },
  ) => {
    const accounts = distinctIds(accountIds);
    const friends = distinctIds(friendIds);
    const [ownedAccounts, ownedFriends] = await Promise.all([
      accounts.length === 0
        ? []
        : db
            .select({ id: bankAccount.id })
            .from(bankAccount)
            .where(and(eq(bankAccount.userId, userId), inArray(bankAccount.id, accounts))),
      friends.length === 0
        ? []
        : db
            .select({ id: friendsProfiles.id })
            .from(friendsProfiles)
            .where(and(eq(friendsProfiles.userId, userId), inArray(friendsProfiles.id, friends))),
    ]);
    if (ownedAccounts.length !== accounts.length) {
      throw new Error('Account not found');
    }
    if (ownedFriends.length !== friends.length) {
      throw new Error('Friend not found');
    }
  },
);

export const getCreditCards = instrumentedFunction(
  'getCreditCards',
  async (db: Database, userId: string) => {
    return db
      .select({
        id: creditCardAccounts.id,
        accountId: creditCardAccounts.accountId,
        startingBalance: bankAccount.startingBalance,
        cardLimit: creditCardAccounts.cardLimit,
        billingDate: creditCardAccounts.billingDate,
        accountName: bankAccount.accountName,
      })
      .from(creditCardAccounts)
      .innerJoin(bankAccount, eq(creditCardAccounts.accountId, bankAccount.id))
      .where(eq(bankAccount.userId, userId));
  },
);
