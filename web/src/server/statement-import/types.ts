export type StatementKind = 'credit_card' | 'bank_account';

type StatementIssuer =
  'icici' | 'yes' | 'indusind' | 'sbi' | 'axis' | 'axis_account' | 'icici_account' | 'sheet';

export type ParsedTransaction = {
  date: string;
  description: string;
  category: string | null;
  amount: number;
  direction: 'debit' | 'credit';
  emi: 'installment' | 'conversion' | null;
};

export type ParsedStatement = {
  kind: StatementKind;
  issuer: StatementIssuer;
  accountLast4: string | null;
  statementDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  minimumDue: number | null;
  creditLimit: number | null;
  declared: { debits: number; credits: number } | null;
  transactions: ParsedTransaction[];
  totals: { debits: number; credits: number };
  reconciliation: { debitsDifference: number; creditsDifference: number } | null;
  balanceCheck: { expected: number; actual: number; difference: number } | null;
};

export type IssuerStatement = Omit<ParsedStatement, 'totals' | 'reconciliation' | 'balanceCheck'>;
