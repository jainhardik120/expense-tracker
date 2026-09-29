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

export const balanceCheckSources = ['manual', 'statement_import'] as const;

export const inboundEmailStatuses = ['received', 'confirmation', 'rejected'] as const;

export const statementImportSources = ['upload', 'email'] as const;

export const statementImportStatuses = ['review', 'applied', 'discarded'] as const;

export const friendInvitationStatuses = ['pending', 'accepted', 'declined', 'revoked'] as const;

export const friendStatementInboxStatuses = ['pending', 'accepted', 'dismissed'] as const;
