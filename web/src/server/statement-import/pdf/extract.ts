import { getDocumentProxy } from 'unpdf';

export type PdfLine = { page: number; y: number; text: string; cells: PdfCell[] };
export type PdfCell = { x: number; text: string };

export class PdfPasswordError extends Error {
  constructor(readonly needsPassword: boolean) {
    super(needsPassword ? 'This statement is password protected' : 'The password is incorrect');
  }
}

type TextItem = { str: string; transform: number[]; width: number };

const LINE_TOLERANCE = 2.5;
const CELL_GAP = 6;

const toLines = (page: number, items: TextItem[]): PdfLine[] => {
  const rows: Array<{ y: number; items: TextItem[] }> = [];
  for (const item of items) {
    if (item.str.trim() === '') {
      continue;
    }
    const y = item.transform[5] ?? 0;
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= LINE_TOLERANCE);
    if (row === undefined) {
      rows.push({ y, items: [item] });
    } else {
      row.items.push(item);
    }
  }
  return rows
    .toSorted((left, right) => right.y - left.y)
    .map((row) => {
      const sorted = row.items.toSorted(
        (left, right) => (left.transform[4] ?? 0) - (right.transform[4] ?? 0),
      );
      const cells: PdfCell[] = [];
      let end = -Infinity;
      for (const item of sorted) {
        const x = item.transform[4] ?? 0;
        const last = cells.at(-1);
        if (last !== undefined && x - end < CELL_GAP) {
          last.text += (x - end > 1 ? ' ' : '') + item.str;
        } else {
          cells.push({ x, text: item.str });
        }
        end = x + item.width;
      }
      for (const cell of cells) {
        cell.text = cell.text.replace(/\s+/g, ' ').trim();
      }
      return { page, y: row.y, cells, text: cells.map((cell) => cell.text).join('  ') };
    });
};

const passwordFailure = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'PasswordException'
  ) {
    const code = 'code' in error ? error.code : undefined;
    return new PdfPasswordError(code === 1);
  }
  return null;
};

export const extractPdfLines = async (data: Uint8Array, password?: string): Promise<PdfLine[]> => {
  let document;
  try {
    document = await getDocumentProxy(new Uint8Array(data), { password });
  } catch (error) {
    throw passwordFailure(error) ?? error;
  }
  const lines: PdfLine[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.flatMap((item): TextItem[] =>
      'str' in item
        ? [{ str: item.str, transform: item.transform as number[], width: item.width }]
        : [],
    );
    lines.push(...toLines(pageNumber, items));
  }
  await document.cleanup();
  return lines;
};
