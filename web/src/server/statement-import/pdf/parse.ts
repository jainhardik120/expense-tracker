import { type PdfLine } from './extract';
import { matchesAxis, parseAxis } from './issuers/axis';
import { matchesAxisAccount, parseAxisAccount } from './issuers/axis-account';
import { matchesIcici, parseIcici } from './issuers/icici';
import { matchesIciciAccount, parseIciciAccount } from './issuers/icici-account';
import { matchesIndusind, parseIndusind } from './issuers/indusind';
import { matchesSbi, parseSbi } from './issuers/sbi';
import { matchesYes, parseYes } from './issuers/yes';

import { finalizeStatement } from '../finalize';
import { type ParsedStatement } from '../types';

const DETECTION_LINES = 80;

const issuers = [
  { matches: matchesIcici, parse: parseIcici },
  { matches: matchesYes, parse: parseYes },
  { matches: matchesIndusind, parse: parseIndusind },
  { matches: matchesSbi, parse: parseSbi },
  { matches: matchesAxis, parse: parseAxis },
  { matches: matchesAxisAccount, parse: parseAxisAccount },
  { matches: matchesIciciAccount, parse: parseIciciAccount },
];

export class UnsupportedStatementError extends Error {
  constructor() {
    super('This statement layout is not supported yet');
  }
}

export const parseStatementLines = (lines: PdfLine[]): ParsedStatement => {
  const text = lines
    .slice(0, DETECTION_LINES)
    .map((line) => line.text)
    .join('\n');
  const issuer = issuers.find((candidate) => candidate.matches(text));
  if (issuer === undefined) {
    throw new UnsupportedStatementError();
  }
  return finalizeStatement(issuer.parse(lines));
};
