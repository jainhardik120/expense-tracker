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
  type creditCardAccounts,
  type emis,
  type friendsProfiles,
  type investments,
  type selfTransferStatements,
  statementKindEnum,
  type statements,
} from '@/db/schema';

export const statementKindMap = {
  expense: 'Expense',
  outside_transaction: 'Outside Transaction',
  friend_transaction: 'Friend Transaction',
  self_transfer: 'Self Transfer',
};
export const amount = z
  .string()
  .refine((val) => val !== '', {
    message: 'Expected a number value',
  })
  .refine((val) => !Number.isNaN(parseInt(val, 10)), {
    message: 'Expected number, received a string',
  });

export const optionalAmount = z
  .string()
  .refine((val) => val === '' || !Number.isNaN(parseInt(val, 10)), {
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

export const ONE_HUNDRED_PERCENTAGE = 100;

export const bulkSplitSchema = z.object({
  friendId: z.uuidv4(),
  percentage: amount,
});

export const createSelfTransferSchema = z.object({
  fromAccountId: z.uuidv4(),
  toAccountId: z.uuidv4(),
  amount: amount,
  createdAt: z.date(),
});

export const createInvestmentSchema = z.object({
  investmentKind: z.string().min(1),
  investmentDate: z.date(),
  investmentAmount: amount,
  maturityDate: z.date().optional(),
  maturityAmount: amount.optional(),
  amount: amount.optional(),
  units: amount.optional(),
  purchaseRate: amount.optional(),
});

export const createCreditCardAccountSchema = z.object({
  accountId: z.string(),
  cardLimit: amount,
});

export type StatementKind = (typeof statementKindEnum.enumValues)[number];
export type Account = typeof bankAccount.$inferSelect;
export type Friend = typeof friendsProfiles.$inferSelect;
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

export type Investment = typeof investments.$inferSelect;
export type CreditCardAccount = typeof creditCardAccounts.$inferSelect;
export type Emi = typeof emis.$inferSelect & {
  creditCardName?: string;
};
export const accountTransferSummarySchema = z.object({
  expenses: z.number(),
  selfTransfers: z.number(),
  outsideTransactions: z.number(),
  friendTransactions: z.number(),
  totalTransfers: z.number(),
});

export type AccountTransferSummary = z.infer<typeof accountTransferSummarySchema>;

export const aggregatedAccountTransferSummarySchema = z
  .object({
    startingBalance: z.number(),
    finalBalance: z.number(),
  })
  .extend(accountTransferSummarySchema.shape);

export type AggregatedAccountTransferSummary = z.infer<
  typeof aggregatedAccountTransferSummarySchema
>;

export const accountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.date().nullable(),
  startingBalance: z.string(),
  accountName: z.string(),
});

export const accountSummarySchema = z
  .object({
    account: accountSchema,
  })
  .extend(aggregatedAccountTransferSummarySchema.shape);

export type AccountSummary = z.infer<typeof accountSummarySchema>;

export const defaultAccountSummary: AggregatedAccountTransferSummary = {
  startingBalance: 0,
  expenses: 0,
  selfTransfers: 0,
  outsideTransactions: 0,
  friendTransactions: 0,
  totalTransfers: 0,
  finalBalance: 0,
};

export const friendTransferSummarySchema = z.object({
  paidByFriend: z.number(),
  splits: z.number(),
  friendTransactions: z.number(),
  totalTransfers: z.number(),
});

export type FriendTransferSummary = z.infer<typeof friendTransferSummarySchema>;

export const aggregatedFriendTransferSummarySchema = z
  .object({
    startingBalance: z.number(),
    finalBalance: z.number(),
  })
  .extend(friendTransferSummarySchema.shape);

export type AggregatedFriendTransferSummary = z.infer<typeof aggregatedFriendTransferSummarySchema>;

export const friendSchema = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.date().nullable(),
  name: z.string(),
});

export const friendSummarySchema = z
  .object({
    friend: friendSchema,
  })
  .extend(aggregatedFriendTransferSummarySchema.shape);

export type FriendSummary = z.infer<typeof friendSummarySchema>;

export const defaultFriendSummary: AggregatedFriendTransferSummary = {
  startingBalance: 0,
  paidByFriend: 0,
  splits: 0,
  friendTransactions: 0,
  totalTransfers: 0,
  finalBalance: 0,
};

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

export const DateTruncValues = ['day', 'week', 'month', 'quarter', 'year'];
export const DateTruncEnum = z.enum(DateTruncValues);
export type DateTruncUnit = z.infer<typeof DateTruncEnum>;
export const MONTHS_PER_YEAR = 12;
export const PERCENTAGE_DIVISOR = 100;
export const MAX_PERCENTAGE = 100;
export const MIN_PERCENTAGE = 0;

export const SECONDS = 1000;
export const MINUTES = 60 * SECONDS;
export const HOURS = 60 * MINUTES;
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
  statementKind: parseAsArrayOf(parseAsStringEnum(statementKindEnum.enumValues), ',').withDefault(
    [],
  ),
};

export const investmentParser = {
  ...pageParser,
  date: parseAsArrayOf(parseAsTimestamp, ',').withDefault([]),
  investmentKind: parseAsArrayOf(parseAsString, ',').withDefault([]),
};

export const emiParser = {
  ...pageParser,
  creditId: parseAsArrayOf(parseAsString, ',').withDefault([]),
};

export const summaryParser = {
  date: parseAsArrayOf(parseAsTimestamp, ',').withDefault([]),
};

export const statementParserSchema = z.object({
  ...dateSchema,
  ...pageSchema,
  statementKind: z.array(z.enum(statementKindEnum.enumValues)).optional().default([]),
  account: z.string().array().optional().default([]),
  category: z.string().array().optional().default([]),
  tags: z.string().array().optional().default([]),
});

export const investmentParserSchema = z.object({
  ...dateSchema,
  ...pageSchema,
  investmentKind: z.string().array().optional().default([]),
});

export const emiParserSchema = z.object({
  ...pageSchema,
  creditId: z.string().array().optional().default([]),
  accountId: z.string().array().optional().default([]),
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

export const emiCalculatorFormSchema = z.object({
  calculationMode: z.enum(['principal', 'emi', 'totalEmi']),
  principalAmount: optionalAmount,
  emiAmount: optionalAmount,
  totalEmiAmount: optionalAmount,
  annualInterestRate: amount,
  tenure: amount,
  gst: amount,
  processingFees: amount,
  processingFeesGst: amount,
});

export const createEmiSchema = emiCalculatorFormSchema.extend({
  name: z.string().min(1),
  creditId: z.string(),
});

export const emiCalculatorParser = {
  calculationMode: parseAsStringEnum(['principal', 'emi', 'totalEmi']).withDefault('emi'),
  principalAmount: parseAsString.withDefault(''),
  emiAmount: parseAsString.withDefault(''),
  totalEmiAmount: parseAsString.withDefault(''),
  annualInterestRate: parseAsString.withDefault('16'),
  tenure: parseAsString.withDefault('6'),
  gst: parseAsString.withDefault('18'),
  processingFees: parseAsString.withDefault('199'),
  processingFeesGst: parseAsString.withDefault('18'),
};
export type EMICalculatorFormValues = z.infer<typeof emiCalculatorFormSchema>;

export interface EMIScheduleRow {
  month: number;
  emi: number;
  interest: number;
  principal: number;
  gst: number;
  totalPayment: number;
  balance: number;
}

export interface EMICalculationResult {
  schedule: EMIScheduleRow[];
  summary: {
    totalEMI: number;
    totalInterest: number;
    totalGST: number;
    totalPrincipal: number;
    processingFees: number;
    processingFeesGST: number;
    totalProcessingFees: number;
    totalAmount: number;
    effectivePrincipal: number;
  };
}
