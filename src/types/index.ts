import { z } from 'zod';

import {
  type bankAccount,
  type friendsProfiles,
  type selfTransferStatements,
  statementKindEnum,
  type statements,
} from '@/db/schema';

export const statementKindMap = {
  expense: 'Expense',
  outside_transaction: 'Outside Transaction',
  friend_transaction: 'Friend Transaction',
};

const amount = z.string().refine((val) => !Number.isNaN(parseInt(val, 10)), {
  message: 'Expected number, received a string',
});

export const createAccountSchema = z.object({
  startingBalance: amount,
  accountName: z.string(),
});

export const createStatementSchema = z.object({
  amount: amount,
  category: z.string().min(1),
  tags: z.string().array(),
  accountId: z.string().optional(),
  friendId: z.string().optional(),
  statementKind: z.enum(statementKindEnum.enumValues),
  createdAt: z.date(),
});

export const createFriendSchema = z.object({
  name: z.string(),
});

export const createSplitSchema = z.object({
  friendId: z.uuidv4(),
  amount: amount,
});

export const createSelfTransferSchema = z.object({
  fromAccountId: z.uuidv4(),
  toAccountId: z.uuidv4(),
  amount: amount,
  createdAt: z.date(),
});

export type Account = typeof bankAccount.$inferSelect;
export type Friend = typeof friendsProfiles.$inferSelect;
export type Statement = typeof statements.$inferSelect & {
  splitAmount: number;
  accountName: string | null;
  friendName: string | null;
};
export type SelfTransferStatement = typeof selfTransferStatements.$inferSelect & {
  fromAccount: string | null;
  toAccount: string | null;
};

export type AccountSummary = {
  account: Account;
  expenses: number;
  selfTransfers: number;
  outsideTransactions: number;
  friendTransactions: number;
  finalAmount: number;
};

export type friendSummary = {
  friend: Friend;
  currentBalance: number;
  paidByFriend: number;
  splits: number;
  friendTransactions: number;
};
