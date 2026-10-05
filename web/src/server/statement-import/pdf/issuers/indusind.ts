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
  valueNear,
} from '../values';

const RIGHT_PANEL = 445;

const amount = (lines: PdfLine[], label: string) =>
  valueNear(lines, label, amountCell, { tolerance: 35 })?.value ?? null;

const signedBalance = (lines: PdfLine[], label: string) => {
  const value = valueNear(lines, label, amountCell, { tolerance: 35 });
  if (value === null) {
    return null;
  }
  return value.marker === 'cr' ? -value.value : value.value;
};

export const matchesIndusind = (text: string) =>
  /IndusInd Bank/i.test(text) && /Credit Card/i.test(text);

export const parseIndusind = (lines: PdfLine[]): IssuerStatement => {
  const period = valueNear(lines, 'Statement Period', (cell) =>
    /\d{2}\/\d{2}\/\d{4}\s+To\s+\d{2}\/\d{2}\/\d{4}/i.test(cell.text) ? cell.text : null,
  );
  const range = splitDateRange(period);
  return {
    kind: 'credit_card',
    issuer: 'indusind',
    accountLast4: maskedCardLast4(lines),
    statementDate: valueNear(lines, 'Statement Date', dateCell, { tolerance: 35 }),
    periodStart: range.start,
    periodEnd: range.end,
    dueDate: valueNear(lines, 'Payment Due Date', dateCell, { tolerance: 35 }),
    openingBalance: signedBalance(lines, 'Previous Balance'),
    closingBalance: amount(lines, 'Total Amount Due'),
    minimumDue: amount(lines, 'Minimum Amount Due'),
    creditLimit: amount(lines, 'Credit Limit'),
    declared: declaredTotals(
      sum(amount(lines, 'Purchases & Other Charges'), amount(lines, 'Cash Advance')),
      amount(lines, 'Payments & Other Credits'),
    ),
    transactions: readTransactions(lines, {
      headers: {
        date: 'Date',
        description: 'Transaction Details',
        category: 'Merchant Category',
        amount: 'Amount',
      },
      minHeaderCells: 4,
      rightEdge: RIGHT_PANEL,
      columnSlack: 48,
      creditWhen: (marker) => marker === 'cr',
    }),
  };
};
