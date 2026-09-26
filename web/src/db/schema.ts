import { desc, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  numeric,
  integer,
  pgEnum,
  uuid,
  check,
  index,
  jsonb,
  boolean,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth-schema';

// Expense Tracker Schema
export const statementKindEnum = pgEnum('statement_kinds', [
  'expense',
  'outside_transaction',
  'friend_transaction',
  'self_transfer',
]);

export const bankAccount = pgTable('bank_account', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  startingBalance: numeric('starting_balance').notNull(),
  accountName: text('account_name').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
});

export const friendsProfiles = pgTable('friends_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
});

export const statements = pgTable(
  'statements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => bankAccount.id, { onDelete: 'no action' }),
    friendId: uuid('friend_id').references(() => friendsProfiles.id, { onDelete: 'no action' }),
    amount: numeric('amount').notNull(),
    category: text('category').notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    statementKind: statementKindEnum().notNull().default('expense'),
    taxableAmount: numeric('taxable_amount'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
    additionalAttributes: jsonb('additional_attributes').notNull().default('{}'),
  },
  (table) => [
    check(
      'expense_check',
      sql`
      (${table.statementKind} != 'expense') OR 
      ((${table.accountId} IS NOT NULL AND ${table.friendId} IS NULL) OR 
       (${table.accountId} IS NULL AND ${table.friendId} IS NOT NULL))
    `,
    ),
    // Friend transaction: Both accountId AND friendId should be filled
    check(
      'friend_transaction_check',
      sql`
      (${table.statementKind} != 'friend_transaction') OR 
      (${table.friendId} IS NOT NULL)
    `,
    ),
    // Outside transaction: friendId should be undefined
    check(
      'outside_transaction_check',
      sql`
      (${table.statementKind} != 'outside_transaction') OR 
      (${table.accountId} IS NOT NULL AND ${table.friendId} IS NULL)
    `,
    ),
    check(
      'statement_taxable_amount_check',
      sql`
      (${table.taxableAmount} IS NULL) OR
      (${table.statementKind} = 'outside_transaction' AND
       ${table.amount} > 0 AND
       ${table.taxableAmount} > 0 AND
       ${table.taxableAmount} <= ${table.amount})
    `,
    ),
    index('statements_created_at_idx').on(desc(table.createdAt)),
  ],
);

export const selfTransferStatements = pgTable(
  'self_transfer_statements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    fromAccountId: uuid('from_account_id')
      .notNull()
      .references(() => bankAccount.id, { onDelete: 'no action' }),
    toAccountId: uuid('to_account_id')
      .notNull()
      .references(() => bankAccount.id, { onDelete: 'no action' }),
    amount: numeric('amount').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('self_transfer_statements_created_at_idx').on(desc(table.createdAt))],
);

export const splits = pgTable('splits', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  statementId: uuid('statement_id')
    .notNull()
    .references(() => statements.id, { onDelete: 'cascade' }),
  amount: numeric('amount').notNull(),
  friendId: uuid('friend_id')
    .notNull()
    .references(() => friendsProfiles.id, {
      onDelete: 'no action',
    }),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
});

export const reportBoundaries = pgTable(
  'report_boundaries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    boundaryDate: timestamp('boundary_date').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('report_boundaries_user_date_idx').on(table.userId, table.boundaryDate)],
);

export const investments = pgTable('investments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  investmentKind: text('investment_kind').notNull(),
  instrumentCode: text('instrument_code'),
  stockMarket: text('stock_market'),
  isRsu: boolean('is_rsu').notNull().default(false),
  investmentDate: timestamp('investment_date').notNull(),
  investmentAmount: numeric('investment_amount').notNull(),
  maturityDate: timestamp('maturity_date'),
  maturityAmount: numeric('maturity_amount'),
  amount: numeric('amount'),
  units: numeric('units'),
  annualRate: numeric('annual_rate'),
  isClosed: boolean('is_closed').notNull().default(false),
  closedAt: timestamp('closed_at'),
});

export const creditCardAccounts = pgTable('credit_card_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => bankAccount.id, { onDelete: 'cascade' })
    .unique(),
  cardLimit: numeric('card_limit').notNull(),
  billingDate: integer('billing_date').notNull().default(1),
});

export const emis = pgTable('emis', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  creditId: uuid('credit_id')
    .notNull()
    .references(() => creditCardAccounts.id, { onDelete: 'no action' }),
  principal: numeric('principal').notNull(),
  tenure: numeric('tenure').notNull(),
  annualInterestRate: numeric('annual_interest_rate').notNull(),
  processingFees: numeric('processing_fees').notNull(),
  processingFeesGst: numeric('processing_fees_gst').notNull(),
  gst: numeric('gst').notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  firstInstallmentDate: timestamp('first_installment_date')
    .notNull()
    .$defaultFn(() => new Date()),
  processingFeesDate: timestamp('processing_fees_date')
    .notNull()
    .$defaultFn(() => new Date()),
  iafe: numeric('iafe').notNull().default('0'),
  additionalAttributes: jsonb('additional_attributes').notNull().default('{}'),
});

export const recurringPaymentFrequencyEnum = pgEnum('recurring_payment_frequency', [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
]);

export const smsTransactionTypeEnum = pgEnum('sms_transaction_type', [
  'income',
  'expense',
  'credit',
  'transfer',
  'investment',
]);

export const smsTransactionStatusEnum = pgEnum('sms_transaction_status', [
  'pending',
  'inserted',
  'junked',
]);

export const recurringPayments = pgTable('recurring_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  amount: numeric('amount').notNull(),
  frequency: recurringPaymentFrequencyEnum().notNull(),
  frequencyMultiplier: numeric('frequency_multiplier').notNull().default('1'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  category: text('category').notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
});

export const smsNotifications = pgTable('sms_notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  amount: numeric('amount').notNull(),
  type: smsTransactionTypeEnum().notNull(),
  merchant: text('merchant'),
  reference: text('reference'),
  accountLast4: text('account_last_4'),
  smsBody: text('sms_body').notNull(),
  sender: text('sender').notNull(),
  createdAt: timestamp('timestamp').notNull(),
  bankName: text('bank_name').notNull(),
  isFromCard: boolean('is_from_card').notNull().default(false),
  currency: text('currency').notNull().default('INR'),
  fromAccount: text('from_account'),
  toAccount: text('to_account'),
  status: smsTransactionStatusEnum().notNull().default('pending'),
  additionalAttributes: jsonb('additional_attributes').notNull().default('{}'),
});

// One PDF report template per user. The four fields mirror @helix-hq/pdf-report's
// ReportTemplate contract: the code step turns raw statement data into display
// values, and the spec places them. Per-user because the calculations encode an
// individual's own way of reading their money.
export const reportTemplates = pgTable('report_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  inputSchema: jsonb('input_schema').notNull(),
  code: text('code').notNull(),
  outputSchema: jsonb('output_schema').notNull(),
  spec: jsonb('spec').notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
});

export const salaryComponentKindEnum = pgEnum('salary_component_kind', ['earning', 'deduction']);

export const salaryComponentFrequencyEnum = pgEnum('salary_component_frequency', [
  'monthly',
  'one_time',
]);

export const salaryComponentClassificationEnum = pgEnum('salary_component_classification', [
  'regular',
  'tax_withholding',
  'provident_fund',
  'other',
]);

export const salaryPayDateRuleEnum = pgEnum('salary_pay_date_rule', ['exact', 'previous_weekday']);

export const salaryComponents = pgTable(
  'salary_components',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: salaryComponentKindEnum().notNull(),
    frequency: salaryComponentFrequencyEnum().notNull().default('monthly'),
    classification: salaryComponentClassificationEnum().notNull().default('regular'),
    affectsTaxableIncome: boolean('affects_taxable_income').notNull().default(false),
    proratable: boolean('proratable').notNull().default(true),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('salary_components_user_name_idx').on(table.userId, table.name)],
);

export const salaryRevisions = pgTable(
  'salary_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    effectiveFrom: timestamp('effective_from').notNull(),
    payDay: integer('pay_day').notNull().default(25),
    payDateRule: salaryPayDateRuleEnum('pay_date_rule').notNull().default('previous_weekday'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('salary_revisions_user_effective_idx').on(table.userId, table.effectiveFrom)],
);

export const salaryRevisionComponents = pgTable(
  'salary_revision_components',
  {
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => salaryRevisions.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => salaryComponents.id, { onDelete: 'restrict' }),
    amount: numeric('amount').notNull(),
  },
  (table) => [primaryKey({ columns: [table.revisionId, table.componentId] })],
);

export const salaryBonuses = pgTable(
  'salary_bonuses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => salaryComponents.id, { onDelete: 'restrict' }),
    expectedDate: timestamp('expected_date').notNull(),
    estimatedAmount: numeric('estimated_amount').notNull(),
    actualAmount: numeric('actual_amount'),
    notes: text('notes'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('salary_bonuses_user_date_idx').on(table.userId, table.expectedDate)],
);

export const salaryPayments = pgTable(
  'salary_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => salaryRevisions.id, { onDelete: 'restrict' }),
    statementId: uuid('statement_id')
      .unique()
      .references(() => statements.id, { onDelete: 'set null' }),
    periodStart: timestamp('period_start').notNull(),
    paymentDate: timestamp('payment_date').notNull(),
    daysPaid: integer('days_paid').notNull(),
    daysInPeriod: integer('days_in_period').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('salary_payments_user_revision_period_idx').on(
      table.userId,
      table.revisionId,
      table.periodStart,
    ),
    index('salary_payments_user_date_idx').on(table.userId, table.paymentDate),
  ],
);

export const salaryPaymentComponents = pgTable(
  'salary_payment_components',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => salaryPayments.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id').references(() => salaryComponents.id, {
      onDelete: 'set null',
    }),
    bonusId: uuid('bonus_id').references(() => salaryBonuses.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    kind: salaryComponentKindEnum().notNull(),
    classification: salaryComponentClassificationEnum().notNull().default('regular'),
    affectsTaxableIncome: boolean('affects_taxable_income').notNull().default(false),
    amount: numeric('amount').notNull(),
  },
  (table) => [index('salary_payment_components_payment_idx').on(table.paymentId)],
);

export const salaryTaxSettings = pgTable(
  'salary_tax_settings',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    financialYearStart: integer('financial_year_start').notNull(),
    standardDeduction: numeric('standard_deduction').notNull().default('75000'),
    otherTaxableIncome: numeric('other_taxable_income').notNull().default('0'),
    otherDeductions: numeric('other_deductions').notNull().default('0'),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.userId, table.financialYearStart] })],
);

/**
 * A budget is a waterfall: income enters at the top, ordered lines take their
 * share, and whatever survives is the residual -- what you managed to save.
 *
 * The year is whatever span the budget covers; it does not have to be a calendar
 * year, and typically starts on the salary cycle rather than in January.
 */
export const budgetYears = pgTable('budget_years', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
});

/** How a line claims money: a fixed sum per month, per year, or whatever is left. */
export const budgetAllocationKindEnum = pgEnum('budget_allocation_kind', [
  'monthly',
  'annual',
  'residual',
  // Funded only by income earmarked to it -- a trip paid for out of a bonus.
  'earmarked',
]);

/**
 * Lines are evaluated in `position` order and the first one whose rule matches a
 * statement claims it, so nothing is counted twice and a catch-all line at the
 * bottom picks up everything that was not claimed above it.
 */
export const budgetLines = pgTable(
  'budget_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    budgetYearId: uuid('budget_year_id')
      .notNull()
      .references(() => budgetYears.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    // Statement filter: categories, tags, friends, accounts, kinds. An empty
    // rule matches everything, which is what makes a catch-all line work.
    rule: jsonb('rule').notNull().default({}),
    allocationKind: budgetAllocationKindEnum('allocation_kind').notNull(),
    allocationAmount: numeric('allocation_amount').notNull().default('0'),
    // Whether day to day choices move this. Rent and money sent home are fixed
    // commitments, so counting them as money you could spend would tell you that
    // you can afford things you cannot.
    discretionary: boolean('discretionary').notNull().default(true),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('budget_lines_year_position_idx').on(table.budgetYearId, table.position)],
);

/** Where income goes: down the waterfall, onto one line, or out of the budget. */
export const budgetIncomeDestinationEnum = pgEnum('budget_income_destination', [
  'waterfall',
  'line',
  'excluded',
]);

export const budgetIncomeLines = pgTable('budget_income_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  budgetYearId: uuid('budget_year_id')
    .notNull()
    .references(() => budgetYears.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  rule: jsonb('rule').notNull().default({}),
  destination: budgetIncomeDestinationEnum('destination').notNull(),
  // Set only when destination is 'line'. Cleared with the line it points at.
  destinationLineId: uuid('destination_line_id').references(() => budgetLines.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
});
