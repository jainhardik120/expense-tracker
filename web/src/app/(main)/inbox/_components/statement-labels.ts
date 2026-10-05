import { format, parseISO } from 'date-fns';

const ISSUER_LABELS: Record<string, string> = {
  icici: 'ICICI',
  yes: 'YES BANK',
  indusind: 'IndusInd',
  sbi: 'SBI Card',
  axis: 'Axis Bank',
};

export const issuerLabel = (issuer: string) => ISSUER_LABELS[issuer] ?? issuer;

export const formatDay = (date: string) => format(parseISO(date), 'dd MMM yyyy');

export const formatShortDay = (date: string) => format(parseISO(date), 'dd MMM');

export const formatPeriod = (start: string, end: string) =>
  `${formatShortDay(start)} – ${formatDay(end)}`;

const REF_NO = /Ref No/gi;
const WHITESPACE = /\s/;

const isSpace = (character: string) => WHITESPACE.test(character);

const skipSpacesBack = (text: string, from: number, floor: number) => {
  let position = from;
  while (position > floor && isSpace(text.charAt(position - 1))) {
    position -= 1;
  }
  return position;
};

const removeReferences = (text: string) => {
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(REF_NO)) {
    if (match.index < cursor) {
      continue;
    }
    let start = skipSpacesBack(text, match.index, cursor);
    if (start > cursor && text.charAt(start - 1) === '-') {
      start = skipSpacesBack(text, start - 1, cursor);
    }
    let end = match.index + match[0].length;
    if (text.charAt(end) === ':') {
      end += 1;
    }
    while (end < text.length && isSpace(text.charAt(end))) {
      end += 1;
    }
    while (end < text.length && !isSpace(text.charAt(end))) {
      end += 1;
    }
    result += text.slice(cursor, start);
    cursor = end;
  }
  return result + text.slice(cursor);
};

export const cleanDescription = (description: string) =>
  removeReferences(description).replace(/\s+/g, ' ').trim();
