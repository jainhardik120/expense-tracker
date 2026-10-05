import { type IssuerStatement, type ParsedTransaction } from '../../types';
import { type PdfLine } from '../extract';
import { parseAmount, parseDate, roundMoney } from '../values';

const TITLE = /Statement of Transactions in Sav\w* Account/i;
const PERIOD_MARKER = /for the period/gi;
const LINE_BREAK = /[\n\r\u2028\u2029]/;
const ACCOUNT = /Account no\.\s*(\d+)/i;
const SERIAL = /^\d+$/;
const PAISE = 100;
const LAST_DIGITS = 4;
const TITLE_GAP = 7;
const DESCRIPTION_SLACK = 10;
const AMOUNT_FROM_END = -2;

type Row = {
  page: number;
  y: number;
  transaction: ParsedTransaction;
  balance: number;
  title: string;
  notes: Array<{ page: number; y: number; text: string }>;
};

const isSpace = (char: string | undefined) => char?.trim() === '';

const spacesFrom = (text: string, start: number) => {
  let end = start;
  while (isSpace(text[end])) {
    end += 1;
  }
  return end - start;
};

const periodEndOf = (rest: string) => {
  const before = spacesFrom(rest, 0);
  if (before === 0 || rest[before] !== '-') {
    return null;
  }
  const after = spacesFrom(rest, before + 1);
  if (after === 0) {
    return null;
  }
  const value = rest.slice(before + 1 + after);
  if (value !== '') {
    return LINE_BREAK.test(value) ? null : value;
  }
  const lastSpace = rest.at(-1) ?? '';
  return after > 1 && !LINE_BREAK.test(lastSpace) ? lastSpace : null;
};

const periodAfter = (text: string) => {
  const lead = spacesFrom(text, 0);
  for (let skip = lead; skip > 0; skip -= 1) {
    for (let end = skip + 1; end <= text.length; end += 1) {
      if (LINE_BREAK.test(text.charAt(end - 1))) {
        break;
      }
      const periodEnd = periodEndOf(text.slice(end));
      if (periodEnd !== null) {
        return { start: text.slice(skip, end), end: periodEnd };
      }
    }
  }
  return null;
};

const periodOf = (title: string) => {
  for (const marker of title.matchAll(PERIOD_MARKER)) {
    const period = periodAfter(title.slice(marker.index + marker[0].length));
    if (period !== null) {
      return period;
    }
  }
  return null;
};

const signedAmount = (transaction: ParsedTransaction) =>
  transaction.direction === 'credit' ? transaction.amount : -transaction.amount;

export const matchesIciciAccount = (text: string) => TITLE.test(text);

export const parseIciciAccount = (lines: PdfLine[]): IssuerStatement => {
  const title = lines.find((line) => TITLE.test(line.text))?.text ?? '';
  const period = periodOf(title);
  const header = lines.find(
    (line) =>
      line.cells.some((cell) => cell.text.startsWith('Withdrawal')) &&
      line.cells.some((cell) => cell.text.startsWith('Deposit')),
  );
  const withdrawalX = header?.cells.find((cell) => cell.text.startsWith('Withdrawal'))?.x ?? 0;
  const depositX = header?.cells.find((cell) => cell.text.startsWith('Deposit'))?.x ?? 0;
  const depositStart =
    Math.min(
      depositX,
      ...lines
        .flatMap((line) => line.cells)
        .filter(
          (cell) => cell.text.startsWith('Amount') && cell.x > withdrawalX + DESCRIPTION_SLACK,
        )
        .map((cell) => cell.x),
    ) - DESCRIPTION_SLACK;
  const descriptionMin =
    (lines.flatMap((line) => line.cells).find((cell) => cell.text.startsWith('Cheque'))?.x ?? 0) +
    DESCRIPTION_SLACK;

  const rows: Row[] = [];
  let pending: Array<{ page: number; y: number; text: string }> = [];
  const flush = (into: Row | undefined) => {
    if (into !== undefined) {
      into.notes.push(...pending);
    }
    pending = [];
  };
  for (const line of lines) {
    const serial = line.cells.at(0);
    const dateCell = line.cells.at(1);
    const rest = line.cells.slice(2);
    const date = dateCell === undefined ? null : parseDate(dateCell.text);
    if (serial !== undefined && SERIAL.test(serial.text) && date !== null) {
      const amounts = rest
        .map((cell) => ({ x: cell.x, value: parseAmount(cell.text)?.value ?? null }))
        .filter((cell): cell is { x: number; value: number } => cell.value !== null);
      const balance = amounts.at(-1);
      const amount = amounts.at(AMOUNT_FROM_END);
      if (balance === undefined || amount === undefined) {
        continue;
      }
      const titleNote = pending.at(-1);
      const ownsTitle = titleNote?.page === line.page && titleNote.y - line.y <= TITLE_GAP;
      if (ownsTitle) {
        pending.pop();
      }
      flush(rows.at(-1));
      const deposit = amount.x >= depositStart;
      rows.push({
        page: line.page,
        y: line.y,
        balance: balance.value,
        title: ownsTitle ? titleNote.text : '',
        notes: [],
        transaction: {
          date,
          description: '',
          category: null,
          amount: roundMoney(amount.value),
          direction: deposit ? 'credit' : 'debit',
          emi: null,
        },
      });
      continue;
    }
    const only = line.cells.length === 1 ? line.cells.at(0) : undefined;
    if (
      only !== undefined &&
      only.x >= descriptionMin &&
      only.x < withdrawalX - DESCRIPTION_SLACK
    ) {
      pending.push({ page: line.page, y: line.y, text: only.text });
    }
  }
  flush(rows.at(-1));
  for (const row of rows) {
    const remark = row.notes.map((note) => note.text).join(' ');
    row.transaction.description = remark === '' ? row.title : remark;
  }

  const chronological =
    rows.length > 1 && (rows.at(0)?.transaction.date ?? '') > (rows.at(-1)?.transaction.date ?? '')
      ? rows.toReversed()
      : rows;
  const first = chronological.at(0);
  const last = chronological.at(-1);
  const signedFirst = first === undefined ? 0 : signedAmount(first.transaction);
  const accountNumber = ACCOUNT.exec(title)?.[1];

  return {
    kind: 'bank_account',
    issuer: 'icici_account',
    accountLast4: accountNumber === undefined ? null : accountNumber.slice(-LAST_DIGITS),
    statementDate: period === null ? null : parseDate(period.end),
    periodStart: period === null ? null : parseDate(period.start),
    periodEnd: period === null ? null : parseDate(period.end),
    dueDate: null,
    openingBalance:
      first === undefined ? null : Math.round((first.balance - signedFirst) * PAISE) / PAISE,
    closingBalance: last?.balance ?? null,
    minimumDue: null,
    creditLimit: null,
    declared: null,
    transactions: chronological.map((row) => row.transaction),
  };
};
