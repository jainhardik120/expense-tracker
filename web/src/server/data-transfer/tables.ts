import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

import {
  accountBalanceChecks,
  accountInterestRates,
  bankAccount,
  budgetIncomeLines,
  budgetLines,
  budgetYears,
  creditCardAccounts,
  emis,
  epfoInterestCredits,
  friendsProfiles,
  instrumentAssetClasses,
  investmentPayments,
  investments,
  recurringPayments,
  reportBoundaries,
  reportTemplates,
  rsuVests,
  salaryBonuses,
  salaryComponents,
  salaryPaymentComponents,
  salaryPayments,
  salaryRevisionComponents,
  salaryRevisions,
  salaryTaxSettings,
  selfTransferStatements,
  smsNotifications,
  splits,
  statementImportLinks,
  statementImports,
  statements,
} from '@/db/schema';

type ColumnKind = 'uuid' | 'timestamp' | 'numeric' | 'json' | 'other';

export type TransferColumn = {
  name: string;
  kind: ColumnKind;
  notNull: boolean;
  isId: boolean;
};

type ConflictRule = { key: string[]; onConflict: 'reuse' | 'skip' };

export type TransferTable = {
  name: string;
  columns: TransferColumn[];
  ownedByUser: boolean;
  scope: { column: string; parent: string } | null;
  conflict: ConflictRule | null;
  orderBy: string | null;
};

const USER_COLUMN = 'user_id';

const kindOf = (columnType: string): ColumnKind => {
  if (columnType === 'PgUUID') {
    return 'uuid';
  }
  if (columnType.startsWith('PgTimestamp')) {
    return 'timestamp';
  }
  if (columnType === 'PgNumeric') {
    return 'numeric';
  }
  if (columnType === 'PgJsonb' || columnType === 'PgJson') {
    return 'json';
  }
  return 'other';
};

const describe = (
  table: PgTable,
  options: { scope?: { column: string; parent: PgTable }; conflict?: ConflictRule } = {},
): TransferTable => {
  const config = getTableConfig(table);
  const columns = config.columns.map((column) => ({
    name: column.name,
    kind: kindOf(column.columnType),
    notNull: column.notNull,
    isId: column.primary && column.name === 'id',
  }));
  return {
    name: config.name,
    columns: columns.filter((column) => column.name !== USER_COLUMN),
    ownedByUser: columns.some((column) => column.name === USER_COLUMN),
    scope:
      options.scope === undefined
        ? null
        : { column: options.scope.column, parent: getTableConfig(options.scope.parent).name },
    conflict: options.conflict ?? null,
    orderBy: columns.some((column) => column.name === 'created_at') ? 'created_at' : null,
  };
};

export const transferTables: TransferTable[] = [
  describe(friendsProfiles),
  describe(bankAccount),
  describe(creditCardAccounts, { scope: { column: 'account_id', parent: bankAccount } }),
  describe(accountBalanceChecks),
  describe(accountInterestRates),
  describe(recurringPayments),
  describe(emis),
  describe(salaryComponents, { conflict: { key: ['name'], onConflict: 'reuse' } }),
  describe(salaryRevisions),
  describe(salaryRevisionComponents, {
    scope: { column: 'revision_id', parent: salaryRevisions },
  }),
  describe(salaryBonuses),
  describe(statements),
  describe(selfTransferStatements),
  describe(splits),
  describe(salaryPayments),
  describe(salaryPaymentComponents, { scope: { column: 'payment_id', parent: salaryPayments } }),
  describe(salaryTaxSettings, {
    conflict: { key: ['financial_year_start'], onConflict: 'skip' },
  }),
  describe(investments),
  describe(investmentPayments),
  describe(rsuVests),
  describe(epfoInterestCredits, {
    conflict: { key: ['instrument_code', 'financial_year_start'], onConflict: 'skip' },
  }),
  describe(instrumentAssetClasses, {
    conflict: { key: ['investment_kind', 'instrument_code'], onConflict: 'skip' },
  }),
  describe(budgetYears, { conflict: { key: ['start_date'], onConflict: 'skip' } }),
  describe(budgetLines, { scope: { column: 'budget_year_id', parent: budgetYears } }),
  describe(budgetIncomeLines, { scope: { column: 'budget_year_id', parent: budgetYears } }),
  describe(reportBoundaries),
  describe(reportTemplates, { conflict: { key: [], onConflict: 'skip' } }),
  describe(smsNotifications),
  describe(statementImports, { conflict: { key: ['file_hash'], onConflict: 'skip' } }),
  describe(statementImportLinks, { scope: { column: 'import_id', parent: statementImports } }),
];

const LOGIN_STATE = 'login state';
const APP_REGISTRATION = 'app registration';
const MARKET_CACHE = 'shared market cache';

export const excludedTables: Record<string, string> = {
  user: 'the account itself',
  session: LOGIN_STATE,
  account: 'login providers',
  verification: LOGIN_STATE,
  jwks: 'server signing keys',
  passkey: 'device credentials',
  two_factor: 'security secret',
  apikey: 'secret',
  oauth_client: APP_REGISTRATION,
  oauth_resource: APP_REGISTRATION,
  oauth_client_resource: APP_REGISTRATION,
  oauth_refresh_token: LOGIN_STATE,
  oauth_access_token: LOGIN_STATE,
  oauth_consent: LOGIN_STATE,
  oauth_client_assertion: LOGIN_STATE,
  email_inboxes: 'forwarding address is unique to the account',
  inbound_emails: 'raw emails live in S3',
  statement_sources: 'passwords are encrypted with this server secret',
  data_imports: 'import history of this account',
  mutual_fund_schemes: MARKET_CACHE,
  mutual_fund_holdings: MARKET_CACHE,
  stock_profiles: MARKET_CACHE,
  market_instruments: MARKET_CACHE,
  market_prices: MARKET_CACHE,
};

export const findTransferTable = (name: string) =>
  transferTables.find((table) => table.name === name);
