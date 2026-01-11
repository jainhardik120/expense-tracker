import { desc, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  numeric,
  pgEnum,
  uuid,
  check,
  index,
  jsonb,
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

export const investments = pgTable('investments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  investmentKind: text('investment_kind').notNull(),
  investmentDate: timestamp('investment_date').notNull(),
  investmentAmount: numeric('investment_amount').notNull(),
  maturityDate: timestamp('maturity_date'),
  maturityAmount: numeric('maturity_amount'),
  amount: numeric('amount'),
  units: numeric('units'),
  purchaseRate: numeric('purchase_rate'),
});

export const creditCardAccounts = pgTable('credit_card_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => bankAccount.id, { onDelete: 'cascade' })
    .unique(),
  cardLimit: numeric('card_limit').notNull(),
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
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  firstInstallmentDate: timestamp('first_installment_date')
    .notNull()
    .$defaultFn(() => new Date()),
  processingFeesDate: timestamp('processing_fees_date')
    .notNull()
    .$defaultFn(() => new Date()),
  iafe: numeric('iafe').notNull().default('0'),
});
