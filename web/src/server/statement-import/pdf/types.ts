type CardIssuer = 'icici' | 'yes' | 'indusind';

export type ParsedTransaction = {
  date: string;
  description: string;
  category: string | null;
  amount: number;
  direction: 'debit' | 'credit';
};

export type ParsedCardStatement = {
  kind: 'credit_card';
  issuer: CardIssuer;
  cardLast4: string | null;
  statementDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  previousBalance: number | null;
  totalDue: number | null;
  minimumDue: number | null;
  creditLimit: number | null;
  declared: { debits: number; credits: number } | null;
  transactions: ParsedTransaction[];
  totals: { debits: number; credits: number };
  reconciliation: { debitsDifference: number; creditsDifference: number } | null;
  balanceCheck: { expected: number; actual: number; difference: number } | null;
};

export type IssuerStatement = Omit<
  ParsedCardStatement,
  'totals' | 'reconciliation' | 'balanceCheck'
>;
