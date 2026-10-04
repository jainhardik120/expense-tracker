import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  parseAsTimestamp,
  parseAsBoolean,
} from 'nuqs/server';
import { z } from 'zod';

import { recurringPaymentFrequencies, smsTransactionStatuses, statementKinds } from '@/db/enums';
import {
  type bankAccount,
  type emis,
  type friendsProfiles,
  type investments,
  type selfTransferStatements,
  type reportBoundaries,
  type statements,
  type recurringPayments,
} from '@/db/schema';
import { investmentKindValues, isUnitBasedInvestment, stockMarketValues } from '@/lib/investments';
import { sortStateParser } from '@/lib/parsers';

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

const MAX_DAYS_IN_MONTH = 31;
const BILLING_DATE_MESSAGE = { message: `Billing date must be between 1 and ${MAX_DAYS_IN_MONTH}` };

export const creditCardBillingDateSchema = z
  .number()
  .int()
  .min(1, BILLING_DATE_MESSAGE)
  .max(MAX_DAYS_IN_MONTH, BILLING_DATE_MESSAGE);

export const createAccountSchema = z.object({
  startingBalance: amount,
  accountName: z.string(),
});

export const createStatementSchema = z.object({
  amount: amount,
  category: z.string().min(1),
  tags: z.string().array(),
  accountId: z.string().nullish(),
  friendId: z.string().nullish(),
  statementKind: z.enum(statementKinds),
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

export const createEmiSplitSchema = z.object({
  friendId: z.uuidv4(),
  percentage: amount,
});

export const createSelfTransferSchema = z.object({
  fromAccountId: z.uuidv4(),
  toAccountId: z.uuidv4(),
  amount: amount,
  createdAt: z.date(),
});

export const createInvestmentSchema = z
  .object({
    investmentKind: z.enum(investmentKindValues),
    instrumentCode: z.string().trim().optional(),
    stockMarket: z.enum(stockMarketValues).optional(),
    isRsu: z.boolean().default(false),
    investmentDate: z.date(),
    investmentAmount: amount,
    maturityDate: z.date().optional(),
    maturityAmount: optionalAmount.optional(),
    units: optionalAmount.optional(),
    annualRate: optionalAmount.optional(),
  })
  .superRefine((value, ctx) => {
    if (isUnitBasedInvestment(value.investmentKind)) {
      if (value.instrumentCode === undefined || value.instrumentCode.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['instrumentCode'],
          message: 'Instrument code is required for stocks, mutual funds, crypto, and commodities',
        });
      }
      if (value.units === undefined || value.units === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['units'],
          message: 'Units are required for stocks, mutual funds, crypto, and commodities',
        });
      }
    }
    if (value.investmentKind === 'stocks' && value.stockMarket === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['stockMarket'],
        message: 'Stock market is required for stocks',
      });
    }
    if (value.isRsu && value.investmentKind !== 'stocks') {
      ctx.addIssue({
        code: 'custom',
        path: ['isRsu'],
        message: 'RSU can only be marked for stocks',
      });
    }
  });

export const createCreditCardAccountSchema = z.object({
  accountId: z.string(),
  cardLimit: amount,
  billingDate: creditCardBillingDateSchema,
});

export type StatementKind = (typeof statementKinds)[number];
export type PaymentStatus = 'paid' | 'missed' | 'upcoming';
export type LinkedStatement = Pick<typeof statements.$inferSelect, 'id' | 'amount' | 'createdAt'>;
export type ReportBoundary = typeof reportBoundaries.$inferSelect;
export type Account = typeof bankAccount.$inferSelect;
export type Friend = typeof friendsProfiles.$inferSelect;
export type Statement = Omit<
  typeof statements.$inferSelect,
  'statementKind' | 'additionalAttributes'
> & {
  type: 'statement';
  statementKind: 'expense' | 'outside_transaction' | 'friend_transaction';
  additionalAttributes: Record<string, unknown>;
  splitAmount: number;
  accountName: string | null;
  friendName: string | null;
  fromAccountId: null;
  toAccountId: null;
  fromAccount: null;
  toAccount: null;
  finalBalance?: number;
};
export type SelfTransferStatement = typeof selfTransferStatements.$inferSelect & {
  type: 'self_transfer';
  statementKind: 'self_transfer';
  accountId: null;
  friendId: null;
  category: null;
  tags: string[];
  splitAmount: number;
  accountName: null;
  friendName: null;
  additionalAttributes?: Record<string, unknown>;
  fromAccount: string | null;
  toAccount: string | null;
  finalBalance?: number;
};

export type Investment = typeof investments.$inferSelect;

export const statementSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  userId: z.string(),
  amount: z.string(),
  taxableAmount: z.string().nullable(),
  type: z.literal('statement'),
  statementKind: z.enum(['expense', 'outside_transaction', 'friend_transaction']),
  accountId: z.string().nullable(),
  friendId: z.string().nullable(),
  category: z.string(),
  tags: z.string().array(),
  splitAmount: z.number(),
  accountName: z.string().nullable(),
  friendName: z.string().nullable(),
  fromAccountId: z.null(),
  toAccountId: z.null(),
  fromAccount: z.null(),
  toAccount: z.null(),
  additionalAttributes: z.record(z.string(), z.unknown()),
  finalBalance: z.number().optional(),
});

export const updateStatementTaxableIncomeSchema = z.object({
  statementId: z.uuidv4(),
  taxableAmount: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)), 'Enter a valid taxable amount')
    .nullable(),
});
export const selfTransferStatementSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  userId: z.string(),
  amount: z.string(),
  type: z.literal('self_transfer'),
  statementKind: z.literal('self_transfer'),
  accountId: z.null(),
  friendId: z.null(),
  category: z.null(),
  tags: z.string().array(),
  splitAmount: z.number(),
  accountName: z.null(),
  friendName: z.null(),
  fromAccountId: z.string(),
  toAccountId: z.string(),
  fromAccount: z.string().nullable(),
  toAccount: z.string().nullable(),
  additionalAttributes: z.record(z.string(), z.unknown()).optional(),
  finalBalance: z.number().optional(),
});
export const rowsCountSchema = z.object({
  statementCount: z.number(),
  selfTransferStatementCount: z.number(),
});
export type Emi = typeof emis.$inferSelect;
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

export const paginatedAccountSummarySchema = z.object({
  account: accountSchema,
  startingBalance: z.number(),
  transfers: accountTransferSummarySchema,
  finalBalance: z.number(),
});

export const paginatedFriendSummarySchema = z.object({
  friend: friendSchema,
  startingBalance: z.number(),
  transfers: friendTransferSummarySchema,
  finalBalance: z.number(),
});

export const statementsResponseSchema = z.object({
  summary: z.union([paginatedAccountSummarySchema, paginatedFriendSummarySchema]).nullable(),
  statements: z.array(z.union([statementSchema, selfTransferStatementSchema])),
  pageCount: z.number(),
  rowsCount: rowsCountSchema,
});

export type PeriodTotals = Omit<ProcessedAggregationData, 'accountsSummary' | 'friendsSummary'>;

export type ProcessedAggregationData = {
  date: Date;
  endDate: Date;
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
  categoryWiseSummary: Record<
    string,
    {
      expenses: number;
      outsideTransactions: number;
    }
  >;
};

export const DateTruncValues = ['day', 'week', 'month', 'quarter', 'year'];
export const DateTruncEnum = z.enum(DateTruncValues);
export type DateTruncUnit = z.infer<typeof DateTruncEnum>;
export const MONTHS_PER_YEAR = 12;
export const PERCENTAGE_DIVISOR = 100;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;
export const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;
export const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY;

export const dateParser = {
  start: parseAsTimestamp,
  end: parseAsTimestamp,
};

export type DateRange = {
  start: Date;
  end: Date;
};

export const DEFAULT_PAGE_SIZE = 10;

export const pageParser = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
};

export const dateSchema = {
  start: z.date().optional(),
  end: z.date().optional(),
};

export const pageSchema = {
  page: z.number().optional().default(1),
  perPage: z.number().optional().default(DEFAULT_PAGE_SIZE),
};

export const aggregationParser = {
  period: parseAsStringEnum(DateTruncValues).withDefault('day'),
  ...dateParser,
};

export const STATEMENT_SORTABLE_COLUMNS = ['date', 'amount', 'category'] as const;

export const statementSortSchema = z
  .array(z.object({ id: z.enum(STATEMENT_SORTABLE_COLUMNS), desc: z.boolean() }))
  .optional()
  .default([]);

export type StatementSort = z.infer<typeof statementSortSchema>;

export const statementSortParamSchema = z.string().optional().default('');

export const parseStatementSort = (raw: string): StatementSort => {
  if (raw === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = statementSortSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
};

export const statementParser = {
  ...pageParser,
  sort: sortStateParser(STATEMENT_SORTABLE_COLUMNS).withDefault([]),
  date: parseAsArrayOf(parseAsTimestamp, ',').withDefault([]),
  account: parseAsArrayOf(parseAsString, ',').withDefault([]),
  category: parseAsArrayOf(parseAsString, ',').withDefault([]),
  tags: parseAsArrayOf(parseAsString, ',').withDefault([]),
  statementKind: parseAsArrayOf(parseAsStringEnum([...statementKinds]), ',').withDefault([]),
};

export const investmentParser = {
  ...pageParser,
  date: parseAsArrayOf(parseAsTimestamp, ',').withDefault([]),
  investmentKind: parseAsArrayOf(parseAsString, ',').withDefault([]),
};

export const emiParser = {
  ...pageParser,
  creditId: parseAsArrayOf(parseAsString, ',').withDefault([]),
  accountId: parseAsArrayOf(parseAsString, ',').withDefault([]),
  completed: parseAsBoolean,
};

export const smsNotificationParser = {
  ...pageParser,
  status: parseAsArrayOf(parseAsStringEnum([...smsTransactionStatuses]), ',').withDefault([
    'pending',
  ]),
  date: parseAsArrayOf(parseAsTimestamp, ',').withDefault([]),
};

export const statementParserSchema = z.object({
  ...dateSchema,
  ...pageSchema,
  sort: statementSortParamSchema,
  statementKind: z.array(z.enum(statementKinds)).optional().default([]),
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
  completed: z.boolean().optional(),
});

export const accountFriendStatementsParserSchema = z.object({
  ...dateSchema,
  ...pageSchema,
  account: z.string(),
});

export const isSelfTransfer = (
  statement: Statement | SelfTransferStatement,
): statement is SelfTransferStatement => {
  return statement.type === 'self_transfer';
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
  principal: optionalAmount,
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
  firstInstallmentDate: z.date(),
  processingFeesDate: z.date(),
  iafe: optionalAmount,
  tags: z.string().array(),
});

export const emiCalculatorParser = {
  calculationMode: parseAsStringEnum(['principal', 'emi', 'totalEmi']).withDefault('emi'),
  principal: parseAsString.withDefault(''),
  emiAmount: parseAsString.withDefault(''),
  totalEmiAmount: parseAsString.withDefault(''),
  annualInterestRate: parseAsString.withDefault('16'),
  tenure: parseAsString.withDefault('6'),
  gst: parseAsString.withDefault('18'),
  processingFees: parseAsString.withDefault('199'),
  processingFeesGst: parseAsString.withDefault('18'),
};
export type EmiCalculatorFormValues = z.infer<typeof emiCalculatorFormSchema>;

export interface EmiScheduleRow {
  installment: number;
  emi: number;
  interest: number;
  principal: number;
  gst: number;
  totalPayment: number;
  balance: number;
  date?: Date;
}

export interface EmiCalculationResult {
  schedule: EmiScheduleRow[];
  summary: {
    monthlyEmi: number;
    totalEmi: number;
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

export type RecurringPayment = typeof recurringPayments.$inferSelect;
export type RecurringPaymentFrequency = (typeof recurringPaymentFrequencies)[number];

export const createRecurringPaymentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: amount,
  frequency: z.enum(recurringPaymentFrequencies),
  frequencyMultiplier: amount.default('1'),
  startDate: z.date(),
  endDate: z.date().nullable(),
  category: z.string().min(1, 'Category is required'),
});

export const recurringPaymentParser = {
  ...pageParser,
  category: parseAsArrayOf(parseAsString, ',').withDefault([]),
  frequency: parseAsArrayOf(parseAsStringEnum([...recurringPaymentFrequencies]), ',').withDefault(
    [],
  ),
};

export const recurringPaymentParserSchema = z.object({
  ...pageSchema,
  category: z.string().array().optional().default([]),
  frequency: z.array(z.enum(recurringPaymentFrequencies)).optional().default([]),
});

export const createSmsNotificationSchema = z.object({
  amount: z.string(),
  type: z.enum(['income', 'expense', 'credit', 'transfer', 'investment']),
  merchant: z.string().nullish(),
  reference: z.string().nullish(),
  accountLast4: z.string().nullish(),
  smsBody: z.string(),
  sender: z.string(),
  timestamp: z.date(),
  bankName: z.string(),
  isFromCard: z.boolean().default(false),
  currency: z.string().default('INR'),
  fromAccount: z.string().nullish(),
  toAccount: z.string().nullish(),
});

export const smsNotificationListSchema = z.object({
  ...pageSchema,
  ...dateSchema,
  status: z.array(z.enum(['pending', 'inserted', 'junked'])).default([]),
});

export * from './salary';
