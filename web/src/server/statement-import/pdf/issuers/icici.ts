import { type IssuerStatement } from '../../types';
import { type PdfLine } from '../extract';
import { readTransactions } from '../table';
import {
  amountCell,
  dateCell,
  declaredTotals,
  maskedCardLast4,
  splitDateRange,
  sum,
  textAfterLabel,
  valueNear,
} from '../values';

const amount = (lines: PdfLine[], label: string) =>
  valueNear(lines, label, amountCell)?.value ?? null;

export const matchesIcici = (text: string) =>
  /ICICI Bank/i.test(text) && /CREDIT CARD STATEMENT/i.test(text);

export const parseIcici = (lines: PdfLine[]): IssuerStatement => {
  const period = splitDateRange(textAfterLabel(lines, 'Statement period'));
  return {
    kind: 'credit_card',
    issuer: 'icici',
    accountLast4: maskedCardLast4(lines),
    statementDate: valueNear(lines, 'STATEMENT DATE', dateCell),
    periodStart: period.start,
    periodEnd: period.end,
    dueDate: valueNear(lines, 'PAYMENT DUE DATE', dateCell),
    openingBalance: amount(lines, 'Previous Balance'),
    closingBalance: amount(lines, 'Total Amount due'),
    minimumDue: amount(lines, 'Minimum Amount due'),
    creditLimit: amount(lines, 'Credit Limit'),
    declared: declaredTotals(
      sum(amount(lines, 'Purchases / Charges'), amount(lines, 'Cash Advances')),
      amount(lines, 'Payments / Credits'),
    ),
    transactions: readTransactions(lines, {
      headers: { date: 'Date', description: 'Transaction Details', amount: 'Amount' },
      minHeaderCells: 4,
      creditWhen: (marker) => marker === 'cr',
    }),
  };
};
