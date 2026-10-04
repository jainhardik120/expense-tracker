/**
 * The values behind the database's enums, as plain constants.
 *
 * The schema builds its pgEnums from these, and anything that runs in the
 * browser -- form schemas, filters, column options -- reads them here. Taken
 * from the pgEnum objects instead, they pulled the whole schema and Drizzle
 * into every page's JavaScript.
 */
export const statementKinds = [
  'expense',
  'outside_transaction',
  'friend_transaction',
  'self_transfer',
] as const;

export const recurringPaymentFrequencies = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;

export const smsTransactionStatuses = ['pending', 'inserted', 'junked'] as const;
