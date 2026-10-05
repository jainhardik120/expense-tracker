import { type PdfCell, type PdfLine } from './extract';
import { leadingDate, parseAmount } from './values';

import { type ParsedTransaction } from '../types';

export type TableLayout = {
  headers: { date: string; description: string; amount: string; category?: string };
  minHeaderCells: number;
  rightEdge?: number;
  columnSlack?: number;
  descriptionOffset?: number;
  undatedRowsInheritDate?: boolean;
  ignoreLines?: RegExp[];
  continuationDistance?: number;
  emiInstallmentMarker?: string;
  emiConversion?: RegExp;
  creditWhen: (marker: 'cr' | 'dr' | null, value: number) => boolean;
};

type Range = { start: number; end: number };
type Columns = { date: Range; description: Range; category: Range | null; amount: Range };

type Row = {
  page: number;
  y: number;
  transaction: ParsedTransaction;
  above: { description: string[]; category: string[] };
  below: { description: string[]; category: string[] };
};

type Continuation = { page: number; y: number; description: string[]; category: string[] };

const DEFAULT_SLACK = 12;
const CONTINUATION_DISTANCE = 13;

const MARKER = /^(?:cr?|dr?|m|credit|debit)$/i;

const joinText = (parts: string[]) => parts.join(' ').replace(/\s+/g, ' ').trim();

const inRange = (cell: PdfCell, range: Range) => cell.x >= range.start && cell.x < range.end;

const headerColumns = (line: PdfLine, layout: TableLayout, slack: number): Columns | null => {
  if (line.cells.length < layout.minHeaderCells) {
    return null;
  }
  const starts = line.cells.map((cell) => cell.x).sort((left, right) => left - right);
  const column = (label: string): Range | null => {
    const cell = line.cells.find((candidate) =>
      candidate.text.toLowerCase().startsWith(label.toLowerCase()),
    );
    if (cell === undefined) {
      return null;
    }
    const next = starts.find((x) => x > cell.x);
    return { start: cell.x - slack, end: next === undefined ? Infinity : next - slack };
  };
  const date = column(layout.headers.date);
  const description = column(layout.headers.description);
  const amount = column(layout.headers.amount);
  if (date === null || description === null || amount === null) {
    return null;
  }
  const category = layout.headers.category === undefined ? null : column(layout.headers.category);
  const offset = layout.descriptionOffset;
  return {
    date: offset === undefined ? date : { start: date.start, end: date.start + offset },
    description:
      offset === undefined ? description : { start: date.start + offset, end: description.end },
    amount: { start: amount.start, end: Infinity },
    category,
  };
};

const continuationOf = (line: PdfLine, cells: PdfCell[], columns: Columns): Continuation | null => {
  if (cells.length === 0 || cells.some((cell) => parseAmount(cell.text) !== null)) {
    return null;
  }
  const description = cells.filter(
    (cell) => inRange(cell, columns.description) && cell.x < columns.amount.start,
  );
  const category =
    columns.category === null
      ? []
      : cells.filter((cell) => inRange(cell, columns.category ?? columns.amount));
  if (description.length + category.length !== cells.length) {
    return null;
  }
  return {
    page: line.page,
    y: line.y,
    description: description.map((cell) => cell.text),
    category: category.map((cell) => cell.text),
  };
};

const markerAfter = (cells: PdfCell[], amountCell: PdfCell) => {
  const next = cells.find((cell) => cell.x > amountCell.x);
  return next === undefined || !MARKER.test(next.text) ? null : next.text.toLowerCase();
};

const emiKind = (layout: TableLayout, description: string, marker: string | null) => {
  if (layout.emiInstallmentMarker !== undefined && marker === layout.emiInstallmentMarker) {
    return 'installment' as const;
  }
  if (layout.emiConversion?.test(description) === true) {
    return 'conversion' as const;
  }
  return null;
};

const rowOf = (
  line: PdfLine,
  cells: PdfCell[],
  columns: Columns,
  layout: TableLayout,
  previousDate: string | null,
): Row | null => {
  const first = cells.at(0);
  if (first === undefined) {
    return null;
  }
  const dated = inRange(first, columns.date) ? leadingDate(first.text) : null;
  const inherited =
    dated === null && layout.undatedRowsInheritDate === true && previousDate !== null
      ? inRange(first, columns.description)
      : false;
  const amountCell = cells.findLast(
    (cell) => inRange(cell, columns.amount) && parseAmount(cell.text) !== null,
  );
  const amount = amountCell === undefined ? null : parseAmount(amountCell.text);
  if ((dated === null && !inherited) || amount === null || amountCell === undefined) {
    return null;
  }
  const rest = dated === null ? cells : cells.slice(1);
  const description = joinText([
    dated?.rest ?? '',
    ...rest
      .filter((cell) => inRange(cell, columns.description) && cell.x < columns.amount.start)
      .map((cell) => cell.text),
  ]);
  const category =
    columns.category === null
      ? []
      : rest
          .filter((cell) => inRange(cell, columns.category ?? columns.amount))
          .map((cell) => cell.text);
  const rawMarker = amount.marker ?? markerAfter(cells, amountCell);
  const emi = emiKind(layout, description, rawMarker);
  let marker: 'cr' | 'dr' | null = null;
  if (rawMarker?.startsWith('c') === true || emi === 'conversion') {
    marker = 'cr';
  } else if (rawMarker !== null) {
    marker = 'dr';
  }
  return {
    page: line.page,
    y: line.y,
    transaction: {
      date: dated?.date ?? previousDate ?? '',
      description,
      category: category.length === 0 ? null : joinText(category),
      amount: Math.abs(amount.value),
      direction: layout.creditWhen(marker, amount.value) ? 'credit' : 'debit',
      emi,
    },
    above: { description: [], category: [] },
    below: { description: [], category: [] },
  };
};

const attach = (rows: Row[], continuation: Continuation, maxDistance: number) => {
  let nearest: Row | null = null;
  for (const row of rows) {
    if (row.page !== continuation.page) {
      continue;
    }
    const distance = Math.abs(row.y - continuation.y);
    if (
      distance <= maxDistance &&
      (nearest === null || distance < Math.abs(nearest.y - continuation.y))
    ) {
      nearest = row;
    }
  }
  if (nearest === null) {
    return;
  }
  const side = continuation.y > nearest.y ? nearest.above : nearest.below;
  side.description.push(...continuation.description);
  side.category.push(...continuation.category);
};

export const readTransactions = (lines: PdfLine[], layout: TableLayout): ParsedTransaction[] => {
  const slack = layout.columnSlack ?? DEFAULT_SLACK;
  const rows: Row[] = [];
  const continuations: Continuation[] = [];
  let columns: Columns | null = null;

  for (const line of lines) {
    const header = headerColumns(line, layout, slack);
    if (header !== null) {
      columns = header;
      continue;
    }
    if (columns === null) {
      continue;
    }
    if (layout.ignoreLines?.some((pattern) => pattern.test(line.text)) === true) {
      continue;
    }
    const current = columns;
    const cells = line.cells.filter(
      (cell) =>
        cell.x >= current.date.start &&
        (layout.rightEdge === undefined || cell.x < layout.rightEdge),
    );
    const row = rowOf(line, cells, columns, layout, rows.at(-1)?.transaction.date ?? null);
    if (row !== null) {
      rows.push(row);
      continue;
    }
    const continuation = continuationOf(line, cells, columns);
    if (continuation !== null) {
      continuations.push(continuation);
    }
  }

  for (const continuation of continuations) {
    attach(rows, continuation, layout.continuationDistance ?? CONTINUATION_DISTANCE);
  }

  return rows.map(({ transaction, above, below }) => {
    const category = joinText([...above.category, transaction.category ?? '', ...below.category]);
    return {
      ...transaction,
      description: joinText([...above.description, transaction.description, ...below.description]),
      category: category === '' ? null : category,
    };
  });
};
