import { extractPdfLines, type PdfLine } from './extract';
import { matchesIcici, parseIcici } from './issuers/icici';
import { matchesIndusind, parseIndusind } from './issuers/indusind';
import { matchesYes, parseYes } from './issuers/yes';
import { type ParsedCardStatement } from './types';
import { roundMoney } from './values';

const RECONCILE_TOLERANCE = 0.01;
const DETECTION_LINES = 80;

const issuers = [
  { matches: matchesIcici, parse: parseIcici },
  { matches: matchesYes, parse: parseYes },
  { matches: matchesIndusind, parse: parseIndusind },
];

export class UnsupportedStatementError extends Error {
  constructor() {
    super('This statement layout is not supported yet');
  }
}

export const parseStatementLines = (lines: PdfLine[]): ParsedCardStatement => {
  const text = lines
    .slice(0, DETECTION_LINES)
    .map((line) => line.text)
    .join('\n');
  const issuer = issuers.find((candidate) => candidate.matches(text));
  if (issuer === undefined) {
    throw new UnsupportedStatementError();
  }
  const statement = issuer.parse(lines);
  const debits = roundMoney(
    statement.transactions
      .filter((row) => row.direction === 'debit')
      .reduce((sum, row) => sum + row.amount, 0),
  );
  const credits = roundMoney(
    statement.transactions
      .filter((row) => row.direction === 'credit')
      .reduce((sum, row) => sum + row.amount, 0),
  );
  const reconciliation =
    statement.declared === null
      ? null
      : {
          debitsDifference: roundMoney(debits - statement.declared.debits),
          creditsDifference: roundMoney(credits - statement.declared.credits),
        };
  const balanceCheck =
    statement.previousBalance === null || statement.totalDue === null
      ? null
      : {
          expected: roundMoney(statement.previousBalance + debits - credits),
          actual: statement.totalDue,
          difference: roundMoney(
            statement.totalDue - (statement.previousBalance + debits - credits),
          ),
        };
  return { ...statement, totals: { debits, credits }, reconciliation, balanceCheck };
};

export const isReconciled = (statement: ParsedCardStatement) =>
  statement.reconciliation !== null &&
  Math.abs(statement.reconciliation.debitsDifference) < RECONCILE_TOLERANCE &&
  Math.abs(statement.reconciliation.creditsDifference) < RECONCILE_TOLERANCE;

export const parseStatementPdf = async (data: Uint8Array, password?: string) =>
  parseStatementLines(await extractPdfLines(data, password));
