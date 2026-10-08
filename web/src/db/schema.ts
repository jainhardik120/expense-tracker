import { desc, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
  date,
  pgView,
} from 'drizzle-orm/pg-core';

import type { StoredBudgetRule } from '@/types/budget';

import { user } from './auth-schema';
import {
  balanceCheckSources,
  inboundEmailStatuses,
  friendInvitationStatuses,
  type ShareKind,
  sharedAnswerStatuses,
  recurringPaymentFrequencies,
  smsTransactionStatuses,
  statementImportSources,
  statementImportStatuses,
  statementKinds,
} from './enums';

import type { EmiAttributes, SmsAttributes, StatementAttributes } from './attributes';

const DEFAULT_PAY_DAY = 25;

export const statementKindEnum = pgEnum('statement_kinds', statementKinds);

export const bankAccount = pgTable(
  'bank_account',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startingBalance: numeric('starting_balance').notNull(),
    accountName: text('account_name').notNull(),
    createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  },
  (table) => [index('bank_account_user_idx').on(table.userId)],
);

export const friendsProfiles = pgTable(
  'friends_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email'),
    linkedUserId: text('linked_user_id').references(() => user.id, { onDelete: 'set null' }),
    linkedProfileId: uuid('linked_profile_id').references((): AnyPgColumn => friendsProfiles.id, {
      onDelete: 'set null',
    }),
    linkedAt: timestamp('linked_at'),
    createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  },
  (table) => [
    index('friends_profiles_user_idx').on(table.userId),
    index('friends_profiles_linked_user_idx')
      .on(table.linkedUserId)
      .where(sql`${table.linkedUserId} IS NOT NULL`),
  ],
);

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
    additionalAttributes: jsonb('additional_attributes')
      .$type<StatementAttributes>()
      .notNull()
      .default({}),
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
    check(
      'friend_transaction_check',
      sql`
      (${table.statementKind} != 'friend_transaction') OR 
      (${table.friendId} IS NOT NULL)
    `,
    ),
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
    index('statements_user_created_id_idx').on(table.userId, desc(table.createdAt), table.id),
    index('statements_user_emi_idx')
      .on(table.userId, sql`(${table.additionalAttributes}->>'emiId')`)
      .where(sql`${table.additionalAttributes}->>'emiId' IS NOT NULL`),
    index('statements_user_recurring_idx')
      .on(table.userId)
      .where(sql`${table.additionalAttributes}->>'recurringPaymentId' IS NOT NULL`),
    index('statements_user_salary_payment_idx')
      .on(table.userId, sql`(${table.additionalAttributes}->>'salaryPaymentId')`)
      .where(sql`${table.additionalAttributes}->>'salaryPaymentId' IS NOT NULL`),
    index('statements_account_created_idx')
      .on(table.accountId, table.createdAt)
      .where(sql`${table.accountId} IS NOT NULL`),
    index('statements_friend_idx')
      .on(table.friendId)
      .where(sql`${table.friendId} IS NOT NULL`),
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
  (table) => [
    index('self_transfer_statements_created_at_idx').on(desc(table.createdAt)),
    index('self_transfer_user_created_id_idx').on(table.userId, desc(table.createdAt), table.id),
  ],
);

export const splits = pgTable(
  'splits',
  {
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
  },
  (table) => [
    index('splits_statement_id_idx').on(table.statementId),
    index('splits_user_statement_idx').on(table.userId, table.statementId),
    index('splits_friend_idx').on(table.friendId),
  ],
);

export const friendInvitationStatusEnum = pgEnum(
  'friend_invitation_status',
  friendInvitationStatuses,
);

export const friendInvitations = pgTable(
  'friend_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inviterUserId: text('inviter_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    friendId: uuid('friend_id')
      .notNull()
      .references(() => friendsProfiles.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    status: friendInvitationStatusEnum().notNull().default('pending'),
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('friend_invitations_pending_friend_idx')
      .on(table.friendId)
      .where(sql`${table.status} = 'pending'`),
    index('friend_invitations_email_status_idx').on(table.email, table.status),
    index('friend_invitations_inviter_idx').on(table.inviterUserId),
  ],
);

export const sharedAnswerStatusEnum = pgEnum('shared_answer_status', sharedAnswerStatuses);

export const sharedAnswers = pgTable(
  'shared_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    viewerUserId: text('viewer_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    splitId: uuid('split_id').references(() => splits.id, { onDelete: 'cascade' }),
    statementId: uuid('statement_id').references(() => statements.id, { onDelete: 'cascade' }),
    status: sharedAnswerStatusEnum(),
    accountId: uuid('account_id').references(() => bankAccount.id, { onDelete: 'no action' }),
    asKind: statementKindEnum('as_kind'),
    category: text('category'),
    tags: text('tags').array(),
    answeredAt: timestamp('answered_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check(
      'shared_answers_one_source',
      sql`num_nonnulls(${table.splitId}, ${table.statementId}) = 1`,
    ),
    uniqueIndex('shared_answers_split_idx')
      .on(table.splitId, table.viewerUserId)
      .where(sql`${table.splitId} IS NOT NULL`),
    uniqueIndex('shared_answers_statement_idx')
      .on(table.statementId, table.viewerUserId)
      .where(sql`${table.statementId} IS NOT NULL`),
    index('shared_answers_viewer_idx').on(table.viewerUserId),
    index('shared_answers_account_idx')
      .on(table.accountId)
      .where(sql`${table.accountId} IS NOT NULL`),
  ],
);

export const visibleStatements = pgView('visible_statements', {
  id: uuid('id').notNull(),
  userId: text('user_id').notNull(),
  accountId: uuid('account_id'),
  friendId: uuid('friend_id'),
  amount: numeric('amount').notNull(),
  category: text('category').notNull(),
  tags: text('tags').array().notNull(),
  statementKind: statementKindEnum().notNull(),
  taxableAmount: numeric('taxable_amount'),
  createdAt: timestamp('created_at').notNull(),
  additionalAttributes: jsonb('additional_attributes').$type<StatementAttributes>().notNull(),
  shareKind: text('share_kind').$type<ShareKind>().notNull(),
}).existing();

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

export const investments = pgTable(
  'investments',
  {
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
  },
  (table) => [index('investments_user_idx').on(table.userId)],
);

export const creditCardAccounts = pgTable('credit_card_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => bankAccount.id, { onDelete: 'cascade' })
    .unique(),
  cardLimit: numeric('card_limit').notNull(),
  billingDate: integer('billing_date').notNull().default(1),
});

export const emis = pgTable(
  'emis',
  {
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
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    additionalAttributes: jsonb('additional_attributes')
      .$type<EmiAttributes>()
      .notNull()
      .default({}),
  },
  (table) => [index('emis_user_idx').on(table.userId)],
);

export const recurringPaymentFrequencyEnum = pgEnum(
  'recurring_payment_frequency',
  recurringPaymentFrequencies,
);

export const smsTransactionTypeEnum = pgEnum('sms_transaction_type', [
  'income',
  'expense',
  'credit',
  'transfer',
  'investment',
]);

export const smsTransactionStatusEnum = pgEnum('sms_transaction_status', smsTransactionStatuses);

export const recurringPayments = pgTable(
  'recurring_payments',
  {
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
  },
  (table) => [index('recurring_payments_user_idx').on(table.userId)],
);

export const smsNotifications = pgTable(
  'sms_notifications',
  {
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
    additionalAttributes: jsonb('additional_attributes')
      .$type<SmsAttributes>()
      .notNull()
      .default({}),
  },
  (table) => [index('sms_notifications_user_idx').on(table.userId)],
);

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
    payDay: integer('pay_day').notNull().default(DEFAULT_PAY_DAY),
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

export const budgetYears = pgTable(
  'budget_years',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    openingBalanceLineId: uuid('opening_balance_line_id'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('budget_years_user_idx').on(table.userId)],
);

export const budgetAllocationKindEnum = pgEnum('budget_allocation_kind', [
  'monthly',
  'annual',
  'residual',
  'earmarked',
  'schedule',
]);

export const budgetLines = pgTable(
  'budget_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    budgetYearId: uuid('budget_year_id')
      .notNull()
      .references(() => budgetYears.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    rule: jsonb('rule').$type<StoredBudgetRule>().notNull().default({}),
    allocationKind: budgetAllocationKindEnum('allocation_kind').notNull(),
    allocationAmount: numeric('allocation_amount').notNull().default('0'),
    discretionary: boolean('discretionary').notNull().default(true),
    closed: boolean('closed').notNull().default(false),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('budget_lines_year_position_idx').on(table.budgetYearId, table.position)],
);

export const budgetIncomeDestinationEnum = pgEnum('budget_income_destination', [
  'waterfall',
  'line',
  'excluded',
]);

export const budgetIncomeSourceEnum = pgEnum('budget_income_source', [
  'statements',
  'pending_salary',
  'pending_bonus',
]);

export const budgetIncomeLines = pgTable('budget_income_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  budgetYearId: uuid('budget_year_id')
    .notNull()
    .references(() => budgetYears.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  rule: jsonb('rule').$type<StoredBudgetRule>().notNull().default({}),
  source: budgetIncomeSourceEnum('source').notNull().default('statements'),
  destination: budgetIncomeDestinationEnum('destination').notNull(),
  destinationLineId: uuid('destination_line_id').references(() => budgetLines.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
});

export const balanceCheckSourceEnum = pgEnum('balance_check_source', balanceCheckSources);

export const accountBalanceChecks = pgTable(
  'account_balance_checks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => bankAccount.id, { onDelete: 'cascade' }),
    checkedAt: timestamp('checked_at').notNull(),
    balance: numeric('balance').notNull(),
    note: text('note'),
    source: balanceCheckSourceEnum().notNull().default('manual'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('account_balance_checks_account_time_idx').on(table.accountId, table.checkedAt),
    index('account_balance_checks_user_idx').on(table.userId),
  ],
);

export const emailInboxes = pgTable(
  'email_inboxes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
    revokedAt: timestamp('revoked_at'),
    confirmationCode: text('confirmation_code'),
    confirmationUrl: text('confirmation_url'),
    confirmationReceivedAt: timestamp('confirmation_received_at'),
  },
  (table) => [
    uniqueIndex('email_inboxes_token_idx').on(table.token),
    uniqueIndex('email_inboxes_active_user_idx')
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

export const inboundEmailStatusEnum = pgEnum('inbound_email_status', inboundEmailStatuses);

export type EmailImportOutcome =
  'imported' | 'duplicate' | 'password' | 'account' | 'not_statement' | 'failed';

export type InboundEmailAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  importOutcome?: EmailImportOutcome;
  importId?: string;
};

export const inboundEmails = pgTable(
  'inbound_emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    inboxId: uuid('inbox_id')
      .notNull()
      .references(() => emailInboxes.id, { onDelete: 'cascade' }),
    sesMessageId: text('ses_message_id').notNull(),
    receivedAt: timestamp('received_at').notNull(),
    fromAddress: text('from_address').notNull(),
    fromDomain: text('from_domain').notNull(),
    subject: text('subject').notNull(),
    dkimVerdict: text('dkim_verdict').notNull(),
    dmarcVerdict: text('dmarc_verdict').notNull(),
    spamVerdict: text('spam_verdict').notNull(),
    virusVerdict: text('virus_verdict').notNull(),
    status: inboundEmailStatusEnum().notNull(),
    rejectReason: text('reject_reason'),
    attachments: jsonb('attachments').$type<InboundEmailAttachment[]>().notNull().default([]),
    objectKey: text('object_key'),
  },
  (table) => [
    uniqueIndex('inbound_emails_ses_message_idx').on(table.sesMessageId),
    index('inbound_emails_user_received_idx').on(table.userId, desc(table.receivedAt)),
  ],
);

export const statementImportSourceEnum = pgEnum('statement_import_source', statementImportSources);

export const statementImportStatusEnum = pgEnum('statement_import_status', statementImportStatuses);

export type StatementImportRow = {
  date: string;
  description: string;
  amount: number;
  direction: 'debit' | 'credit';
  emi: 'installment' | 'conversion' | null;
};

export type StatementImportSummary = {
  kind?: 'credit_card' | 'bank_account';
  dueDate: string | null;
  minimumDue: number | null;
  creditLimit: number | null;
  cardLast4: string | null;
  declared: { debits: number; credits: number } | null;
  totals: { debits: number; credits: number };
};

export type StatementImportOutcome = {
  matches: Array<{ rows: number[]; ledger: string[] }>;
  added: number;
  adjusted: number;
  redated: number;
};

export type StatementImportCheck = {
  computedAt: string;
  gap: number | null;
  add: number;
  adjust: number;
  redate: number;
  outside?: number;
  notOnStatement: number;
  elsewhere: number;
  likelyNext: number;
};

export const statementImports = pgTable(
  'statement_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => bankAccount.id, { onDelete: 'cascade' }),
    source: statementImportSourceEnum().notNull(),
    inboundEmailId: uuid('inbound_email_id').references(() => inboundEmails.id, {
      onDelete: 'set null',
    }),
    fileName: text('file_name').notNull(),
    fileHash: text('file_hash').notNull(),
    issuer: text('issuer').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    statementDate: date('statement_date', { mode: 'string' }),
    openingBalance: numeric('opening_balance'),
    closingBalance: numeric('closing_balance'),
    totalDue: numeric('total_due'),
    rows: jsonb('rows').$type<StatementImportRow[]>().notNull(),
    summary: jsonb('summary').$type<StatementImportSummary>().notNull(),
    outcome: jsonb('outcome').$type<StatementImportOutcome>(),
    check: jsonb('check').$type<StatementImportCheck>(),
    status: statementImportStatusEnum().notNull().default('review'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
    appliedAt: timestamp('applied_at'),
  },
  (table) => [
    uniqueIndex('statement_imports_user_file_idx').on(table.userId, table.fileHash),
    index('statement_imports_account_period_idx').on(table.accountId, table.periodStart),
    index('statement_imports_user_status_idx').on(table.userId, table.status),
  ],
);

export const statementImportLinks = pgTable(
  'statement_import_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    importId: uuid('import_id')
      .notNull()
      .references(() => statementImports.id, { onDelete: 'cascade' }),
    statementId: uuid('statement_id').references(() => statements.id, { onDelete: 'cascade' }),
    selfTransferId: uuid('self_transfer_id').references(() => selfTransferStatements.id, {
      onDelete: 'cascade',
    }),
  },
  (table) => [
    index('statement_import_links_import_idx').on(table.importId),
    index('statement_import_links_statement_idx').on(table.statementId),
    index('statement_import_links_self_transfer_idx').on(table.selfTransferId),
    check(
      'statement_import_links_one_target',
      sql`num_nonnulls(${table.statementId}, ${table.selfTransferId}) = 1`,
    ),
  ],
);

export const statementSources = pgTable('statement_sources', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => bankAccount.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  issuer: text('issuer').notNull(),
  cardLast4: text('card_last4'),
  password: text('password'),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
});
