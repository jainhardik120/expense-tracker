import { type IssuerStatement, type ParsedTransaction } from '../../types';
import { type PdfLine } from '../extract';
import { parseAmount, parseDate, roundMoney } from '../values';

const DATE = /^\d{2}-\d{2}-\d{4}/;
const DATE_LENGTH = 10;
const LINE_BREAK = /[\n\r\u2028\u2029]/;
const PERIOD = /period from (\d{2}-\d{2}-\d{4}) to (\d{2}-\d{2}-\d{4})/i;
const ACCOUNT = /Statement for Account No\.\s*\S*?(\d{4})\b/i;
const PAISE = 100;

const amountsIn = (texts: string[]) =>
  texts
    .flatMap((text) => text.split(/\s+/))
    .map((token) => parseAmount(token))
    .filter((value) => value !== null)
    .map((value) => value.value);

const lastAmount = (line: PdfLine | undefined) =>
  line === undefined ? null : (amountsIn(line.cells.map((cell) => cell.text)).at(-1) ?? null);

const splitDated = (text: string) => {
  if (!DATE.test(text)) {
    return null;
  }
  const date = text.slice(0, DATE_LENGTH);
  const tail = text.slice(DATE_LENGTH);
  if (tail === '') {
    return { date, remainder: undefined };
  }
  const remainder = tail.trimStart();
  if (remainder.length === tail.length || LINE_BREAK.test(remainder)) {
    return null;
  }
  return { date, remainder };
};

export const matchesAxisAccount = (text: string) =>
  /Statement for Account No\./i.test(text) && /Opening Balance/i.test(text);

export const parseAxisAccount = (lines: PdfLine[]): IssuerStatement => {
  const allText = lines.map((line) => line.text).join('\n');
  const period = PERIOD.exec(allText);
  const openingLine = lines.find((line) => /Opening Balance/i.test(line.text));
  const closingLine = lines.find((line) => /Closing Balance/i.test(line.text));
  const opening = lastAmount(openingLine);
  const closing = lastAmount(closingLine);

  const transactions: ParsedTransaction[] = [];
  let balance = opening;
  let inTable = false;
  for (const line of lines) {
    if (line === openingLine) {
      inTable = true;
      continue;
    }
    if (line === closingLine) {
      break;
    }
    if (!inTable) {
      continue;
    }
    const first = line.cells.at(0);
    const second = line.cells.at(1);
    const others = line.cells.slice(2);
    const dated = splitDated(first?.text ?? '');
    if (dated === null) {
      const previous = transactions.at(-1);
      if (previous !== undefined && amountsIn(line.cells.map((cell) => cell.text)).length === 0) {
        previous.description = `${previous.description} ${line.text}`.replace(/\s+/g, ' ').trim();
      }
      continue;
    }
    const date = parseDate(dated.date);
    const description = dated.remainder ?? second?.text ?? '';
    const rest =
      dated.remainder === undefined
        ? others
        : [second, ...others].filter((cell) => cell !== undefined);
    const amounts = amountsIn(rest.map((cell) => cell.text));
    const next = amounts.at(-1);
    if (date === null || next === undefined || balance === null || amounts.length < 2) {
      continue;
    }
    const change = Math.round((next - balance) * PAISE) / PAISE;
    transactions.push({
      date,
      description,
      category: null,
      amount: roundMoney(Math.abs(change)),
      direction: change < 0 ? 'debit' : 'credit',
      emi: null,
    });
    balance = next;
  }

  return {
    kind: 'bank_account',
    issuer: 'axis_account',
    accountLast4: ACCOUNT.exec(allText)?.[1] ?? null,
    statementDate: period?.[2] === undefined ? null : parseDate(period[2]),
    periodStart: period?.[1] === undefined ? null : parseDate(period[1]),
    periodEnd: period?.[2] === undefined ? null : parseDate(period[2]),
    dueDate: null,
    openingBalance: opening,
    closingBalance: closing,
    minimumDue: null,
    creditLimit: null,
    declared: null,
    transactions,
  };
};
