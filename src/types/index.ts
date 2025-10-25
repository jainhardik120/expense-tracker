import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  parseAsTimestamp,
} from 'nuqs/server';
import { z } from 'zod';

import {
  type bankAccount,
  type friendsProfiles,
  type selfTransferStatements,
  type session,
  statementKindEnum,
  type statements,
} from '@/db/schema';

export const statementKindMap = {
  expense: 'Expense',
  outside_transaction: 'Outside Transaction',
  friend_transaction: 'Friend Transaction',
  self_transfer: 'Self Transfer',
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

export type StatementKind = (typeof statementKindEnum.enumValues)[number];
export type Account = typeof bankAccount.$inferSelect;
export type Friend = typeof friendsProfiles.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Statement = typeof statements.$inferSelect & {
  splitAmount: number;
  accountName: string | null;
  friendName: string | null;
  finalBalance?: number;
};
export type SelfTransferStatement = typeof selfTransferStatements.$inferSelect & {
  fromAccount: string | null;
  toAccount: string | null;
  finalBalance?: number;
};

export type AccountTransferSummary = {
  expenses: number;
  selfTransfers: number;
  outsideTransactions: number;
  friendTransactions: number;
  totalTransfers: number;
};

export type AggregatedAccountTransferSummary = {
  startingBalance: number;
  finalBalance: number;
} & AccountTransferSummary;

export type AccountSummary = {
  account: Account;
} & AggregatedAccountTransferSummary;

export const defaultAccountSummary: AggregatedAccountTransferSummary = {
  startingBalance: 0,
  expenses: 0,
  selfTransfers: 0,
  outsideTransactions: 0,
  friendTransactions: 0,
  totalTransfers: 0,
  finalBalance: 0,
};

export type FriendTransferSummary = {
  paidByFriend: number;
  splits: number;
  friendTransactions: number;
  totalTransfers: number;
};

export type AggregatedFriendTransferSummary = {
  startingBalance: number;
  finalBalance: number;
} & FriendTransferSummary;

export const defaultFriendSummary: AggregatedFriendTransferSummary = {
  startingBalance: 0,
  paidByFriend: 0,
  splits: 0,
  friendTransactions: 0,
  totalTransfers: 0,
  finalBalance: 0,
};

export type FriendSummary = {
  friend: Friend;
} & AggregatedFriendTransferSummary;

export type ProcessedAggregationData = {
  date: Date;
  accountsSummary: ({
    startingBalance: number;
    finalBalance: number;
  } & AccountTransferSummary & {
      accountId: string;
    })[];
  friendsSummary: ({
    startingBalance: number;
    finalBalance: number;
  } & FriendTransferSummary & {
      friendId: string;
    })[];
  totalAccountsSummary: AggregatedAccountTransferSummary;
  totalFriendsSummary: AggregatedFriendTransferSummary;
  totalExpenses: number;
};

export const DateTruncValues = [
  'second',
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
];
export const DateTruncEnum = z.enum(DateTruncValues);
export type DateTruncUnit = z.infer<typeof DateTruncEnum>;

export const SECONDS = 1000;
export const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;
export const DAYS = 24 * HOURS;

export const dateParser = {
  start: parseAsTimestamp,
  end: parseAsTimestamp,
};

export type DateRange = {
  start: Date;
  end: Date;
};

const pageParser = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
};

export const dateSchema = {
  start: z.date().optional(),
  end: z.date().optional(),
};

const pageSchema = {
  page: z.number().optional().default(1),
  perPage: z.number().optional().default(10),
};

export const aggregationParser = {
  period: parseAsStringEnum(DateTruncValues).withDefault('day'),
  ...dateParser,
};

export const statementParser = {
  ...pageParser,
  date: parseAsArrayOf(parseAsTimestamp, ',').withDefault([]),
  account: parseAsArrayOf(parseAsString, ',').withDefault([]),
  category: parseAsArrayOf(parseAsString, ',').withDefault([]),
  tags: parseAsArrayOf(parseAsString, ',').withDefault([]),
};

export const summaryParser = {
  date: parseAsArrayOf(parseAsTimestamp, ',').withDefault([]),
};

export const statementParserSchema = z.object({
  ...dateSchema,
  ...pageSchema,
  account: z.string().array().optional().default([]),
  category: z.string().array().optional().default([]),
  tags: z.string().array().optional().default([]),
});

export const accountFriendStatementsParserSchema = z.object({
  ...dateSchema,
  ...pageSchema,
  account: z.string(),
});

export const isSelfTransfer = (
  statement: Statement | SelfTransferStatement,
): statement is SelfTransferStatement => {
  return 'fromAccountId' in statement;
};

export const isFriendSummary = (
  summary: FriendSummary | AccountSummary,
): summary is FriendSummary => {
  return 'friend' in summary;
};

export const TIMEZONE_COOKIE = 'timezone';
export const TIME_OFFSET_COOKIE = 'time-offset';
