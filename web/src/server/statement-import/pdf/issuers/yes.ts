import { type PdfLine } from '../extract';
import { readTransactions } from '../table';
import { type IssuerStatement } from '../types';
import {
  amountCell,
  declaredTotals,
  maskedCardLast4,
  parseDate,
  splitDateRange,
  textAfterLabel,
  valueNear,
} from '../values';

const amount = (lines: PdfLine[], label: string) =>
  valueNear(lines, label, amountCell, { tolerance: 60 })?.value ?? null;

const signedBalance = (lines: PdfLine[], label: string) => {
  const value = valueNear(lines, label, amountCell, { tolerance: 60 });
  if (value === null) {
    return null;
  }
  return value.marker === 'cr' ? -value.value : value.value;
};

export const matchesYes = (text: string) =>
  /YES BANK/i.test(text) && /Credit Card Statement/i.test(text);

export const parseYes = (lines: PdfLine[]): IssuerStatement => {
  const period = valueNear(lines, 'Statement Period', (cell) =>
    /\d{2}\/\d{2}\/\d{4}\s+To\s+\d{2}\/\d{2}\/\d{4}/i.test(cell.text) ? cell.text : null,
  );
  const range = splitDateRange(period);
  const statementDate = textAfterLabel(lines, 'Statement Date');
  const dueDate = textAfterLabel(lines, 'Payment Due Date');
  return {
    kind: 'credit_card',
    issuer: 'yes',
    cardLast4: maskedCardLast4(lines),
    statementDate: statementDate === null ? null : parseDate(statementDate),
    periodStart: range.start,
    periodEnd: range.end,
    dueDate: dueDate === null ? null : parseDate(dueDate),
    previousBalance: signedBalance(lines, 'Previous Balance'),
    totalDue: amount(lines, 'Total Amount Due'),
    minimumDue: amount(lines, 'Minimum Amount Due'),
    creditLimit: amount(lines, 'Credit Limit'),
    declared: declaredTotals(
      amount(lines, 'Current Purchases'),
      amount(lines, 'Payment & Credits Received'),
    ),
    transactions: readTransactions(lines, {
      headers: {
        date: 'Date',
        description: 'Transaction Details',
        category: 'Merchant Category',
        amount: 'Amount',
      },
      minHeaderCells: 4,
      creditWhen: (marker) => marker === 'cr',
    }),
  };
};
