import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  numeric,
  pgEnum,
  uuid,
  check,
} from 'drizzle-orm/pg-core';

// Auth Schema
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified')
    .$defaultFn(() => false)
    .notNull(),
  image: text('image'),
  createdAt: timestamp('created_at')
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp('updated_at')
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()),
});

// Expense Tracker Schema
export const statementKindEnum = pgEnum('statement_kinds', [
  'expense',
  'outside_transaction',
  'friend_transaction',
]);

export const bankAccount = pgTable('bank_account', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  startingBalance: numeric('starting_balance').notNull(),
  accountName: text('account_name').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()),
});

export const friendsProfiles = pgTable('friends_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()),
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
    updatedAt: timestamp('updated_at')
      .notNull()
      .$defaultFn(() => new Date()),
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
      (${table.accountId} IS NOT NULL AND ${table.friendId} IS NOT NULL)
    `,
    ),
    // Outside transaction: friendId should be undefined
    check(
      'outside_transaction_check',
      sql`
      (${table.statementKind} != 'outside_transaction') OR 
      (${table.friendId} IS NULL)
    `,
    ),
  ],
);

export const selfTransferStatements = pgTable('self_transfer_statements', {
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
  updatedAt: timestamp('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
});

export const splits = pgTable('splits', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  statementId: uuid('statement_id')
    .notNull()
    .references(() => statements.id, { onDelete: 'no action' }),
  amount: numeric('amount').notNull(),
  friendId: uuid('friend_id')
    .notNull()
    .references(() => friendsProfiles.id, {
      onDelete: 'no action',
    }),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
});
