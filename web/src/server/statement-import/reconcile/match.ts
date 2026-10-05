export type Direction = 'debit' | 'credit';

export type StatementEntry = {
  index: number;
  date: string;
  amount: number;
  direction: Direction;
  description: string;
  emi: 'installment' | 'conversion' | null;
};

export type LedgerEntry = {
  key: string;
  date: string;
  amount: number;
  direction: Direction;
  label: string;
};

type MatchKind =
  'exact' | 'ledger_club' | 'statement_club' | 'window' | 'reversal' | 'near' | 'emi_rounding';

export type MatchGroup = {
  kind: MatchKind;
  statement: number[];
  ledger: string[];
  difference: number;
};

type Suggestion =
  | { type: 'add'; statement: number; foldInto: string | null }
  | { type: 'adjust'; ledger: string; from: number; to: number; group: number }
  | { type: 'add_difference'; amount: number; direction: Direction; date: string; group: number }
  | { type: 'redate'; ledger: string; from: string; to: string; group: number }
  | { type: 'not_on_statement'; ledger: string };

export type Reconciliation = {
  groups: MatchGroup[];
  suggestions: Suggestion[];
  statementNet: number;
  ledgerNet: number;
  residual: number;
};

export type ReconcileInput = {
  statement: StatementEntry[];
  ledger: LedgerEntry[];
  period: { start: string; end: string };
};

type Side = 'statement' | 'ledger';

type Item = {
  id: string;
  side: Side;
  day: number;
  date: string;
  amount: number;
  signed: number;
  direction: Direction;
  description: string;
  emi: StatementEntry['emi'];
  index: number;
  key: string;
};

type Candidate = {
  rank: number[];
  kind: MatchKind;
  items: Item[];
};

const DAY_MS = 86_400_000;
const EXACT_DAYS = 3;
const CLUB_DAYS = 7;
const CLUB_MAX_SIZE = 5;
const CLUB_POOL = 14;
const WINDOW_SHORT_DAYS = 10;
const WINDOW_LONG_DAYS = 35;
const WINDOW_DAYS = [WINDOW_SHORT_DAYS, WINDOW_LONG_DAYS];
const WINDOW_LEDGER_POOL = 6;
const WINDOW_LEDGER_MAX = 4;
const WINDOW_STATEMENT_POOL = 14;
const EMI_LEDGER_POOL = 24;
const REVERSAL_DAYS = 45;
const EMI_TOLERANCE = 100;
const NEAR_MIN_TOLERANCE = 100;
const NEAR_MAX_TOLERANCE = 5000;
const NEAR_RATIO = 0.03;
const FEE_MAX = 5000;
const TINY_AMOUNT = 500;
const NEAR_RANK_SCALE = 10_000;
const NEAR_CLUB_RATIO = 0.05;
const NEAR_CLUB_MAX_SIZE = 4;
const NEAR_CLUB_POOL = 10;
const YEAR_END = 4;
const MONTH_START = 5;
const MONTH_END = 7;
const DAY_START = 8;
const DAY_END = 10;
const FEE_PATTERN = /\b(?:fee|gst|igst|cgst|sgst|tax|surcharge|charges?|interest|markup)\b/i;

const dayNumber = (date: string) =>
  Date.UTC(
    Number(date.slice(0, YEAR_END)),
    Number(date.slice(MONTH_START, MONTH_END)) - 1,
    Number(date.slice(DAY_START, DAY_END)),
  ) / DAY_MS;

const signedAmount = (amount: number, direction: Direction) =>
  direction === 'debit' ? -amount : amount;

const gap = (left: Item, right: Item) => Math.abs(left.day - right.day);

const spreadOf = (items: Item[]) => {
  const days = items.map((item) => item.day);
  return Math.max(...days) - Math.min(...days);
};

const total = (items: Item[]) => items.reduce((sum, item) => sum + item.signed, 0);

const firstNonZero = (...values: number[]) =>
  values.find((value) => value !== 0 && !Number.isNaN(value)) ?? 0;

const compareIds = (left: string, right: string) => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const order = (left: Item, right: Item) =>
  firstNonZero(left.day - right.day, compareIds(left.id, right.id));

const compareRank = (left: number[], right: number[]) => {
  for (let position = 0; position < Math.max(left.length, right.length); position += 1) {
    const difference = (left[position] ?? 0) - (right[position] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

const combinations = <T>(pool: T[], size: number, start = 0): T[][] => {
  if (size === 0) {
    return [[]];
  }
  const result: T[][] = [];
  for (let position = start; position <= pool.length - size; position += 1) {
    const head = pool[position];
    if (head === undefined) {
      continue;
    }
    for (const rest of combinations(pool, size - 1, position + 1)) {
      result.push([head, ...rest]);
    }
  }
  return result;
};

const nearest = (anchor: Item, pool: Item[], days: number, limit: number) =>
  pool
    .filter((item) => item !== anchor && gap(item, anchor) <= days)
    .sort((left, right) => firstNonZero(gap(left, anchor) - gap(right, anchor), order(left, right)))
    .slice(0, limit);

const PAYMENT_PATTERN = /\b(?:payment|bbps|autopay)\b/i;
const EMI_PATTERN = /\bEMI\b/i;

const isEmiFamily = (item: Item) =>
  item.side === 'statement' && (item.emi === 'installment' || EMI_PATTERN.test(item.description));

const hasInstallment = (items: Item[]) => items.some(isEmiFamily);

class Matcher {
  private readonly items: Item[];
  private readonly matched = new Set<string>();
  private readonly narrow: { start: number; end: number };
  wide = false;
  readonly groups: MatchGroup[] = [];

  constructor(input: ReconcileInput) {
    this.narrow = {
      start: dayNumber(input.period.start) - EXACT_DAYS,
      end: dayNumber(input.period.end) + EXACT_DAYS,
    };
    this.items = [
      ...input.statement.map((entry): Item => ({
        id: `s:${String(entry.index)}`,
        side: 'statement',
        day: dayNumber(entry.date),
        date: entry.date,
        amount: entry.amount,
        signed: signedAmount(entry.amount, entry.direction),
        direction: entry.direction,
        description: entry.description,
        emi: entry.emi,
        index: entry.index,
        key: '',
      })),
      ...input.ledger.map((entry): Item => ({
        id: `l:${entry.key}`,
        side: 'ledger',
        day: dayNumber(entry.date),
        date: entry.date,
        amount: entry.amount,
        signed: signedAmount(entry.amount, entry.direction),
        direction: entry.direction,
        description: entry.label,
        emi: null,
        index: -1,
        key: entry.key,
      })),
    ].sort(order);
  }

  free(side?: Side) {
    return this.items.filter(
      (item) =>
        !this.matched.has(item.id) &&
        (side === undefined || item.side === side) &&
        (this.wide ||
          item.side === 'statement' ||
          (item.day >= this.narrow.start && item.day <= this.narrow.end)),
    );
  }

  private accept(kind: MatchKind, items: Item[]) {
    if (items.some((item) => this.matched.has(item.id))) {
      return false;
    }
    for (const item of items) {
      this.matched.add(item.id);
    }
    const statement = items.filter((item) => item.side === 'statement').sort(order);
    const ledger = items.filter((item) => item.side === 'ledger').sort(order);
    this.groups.push({
      kind,
      statement: statement.map((item) => item.index),
      ledger: ledger.map((item) => item.key),
      difference: total(statement) - total(ledger),
    });
    return true;
  }

  private acceptAll(candidates: Candidate[]) {
    let accepted = 0;
    for (const candidate of candidates.toSorted((left, right) =>
      compareRank(left.rank, right.rank),
    )) {
      if (this.accept(candidate.kind, candidate.items)) {
        accepted += 1;
      }
    }
    return accepted;
  }

  exactPairs() {
    const ledger = this.free('ledger');
    const candidates: Candidate[] = [];
    for (const entry of this.free('statement')) {
      for (const other of ledger) {
        if (other.signed === entry.signed && gap(entry, other) <= EXACT_DAYS) {
          candidates.push({
            rank: [gap(entry, other), entry.day, entry.index],
            kind: 'exact',
            items: [entry, other],
          });
        }
      }
    }
    this.acceptAll(candidates);
  }

  clubs(approximate: boolean) {
    const candidates: Candidate[] = [];
    const sides: Array<[Side, Side, MatchKind]> = [
      ['ledger', 'statement', 'ledger_club'],
      ['statement', 'ledger', 'statement_club'],
    ];
    for (const [one, other, kind] of sides) {
      const pool = this.free(other);
      for (const anchor of this.free(one)) {
        const near = nearest(
          anchor,
          pool.filter((item) => item.amount <= anchor.amount * 2),
          CLUB_DAYS,
          CLUB_POOL,
        );
        for (let size = 2; size <= CLUB_MAX_SIZE; size += 1) {
          for (const combo of combinations(near, size)) {
            const members = [...combo, anchor];
            const difference = Math.abs(total(combo) - anchor.signed);
            const allowed = approximate && hasInstallment(members) ? EMI_TOLERANCE : 0;
            if (difference > allowed || (approximate && difference === 0)) {
              continue;
            }
            if (!combo.some((item) => item.direction === anchor.direction)) {
              continue;
            }
            candidates.push({
              rank: [difference, size, spreadOf(members), anchor.day],
              kind: approximate ? 'emi_rounding' : kind,
              items: members,
            });
          }
        }
      }
    }
    this.acceptAll(candidates);
  }

  reversals(conversionsOnly: boolean) {
    for (const side of ['statement', 'ledger'] as const) {
      const pool = this.free(side).filter(
        (item) => item.side === 'ledger' || !PAYMENT_PATTERN.test(item.description),
      );
      const candidates: Candidate[] = [];
      for (const [position, first] of pool.entries()) {
        for (const second of pool.slice(position + 1)) {
          const conversion = first.emi === 'conversion' || second.emi === 'conversion';
          if (conversionsOnly && !conversion) {
            continue;
          }
          const allowed = conversion ? EMI_TOLERANCE : 0;
          if (
            first.direction !== second.direction &&
            Math.abs(first.amount - second.amount) <= allowed &&
            gap(first, second) <= REVERSAL_DAYS
          ) {
            candidates.push({
              rank: [Math.abs(first.amount - second.amount), gap(first, second), first.day],
              kind: 'reversal',
              items: [first, second, ...this.leftoverFor(side, first, second)],
            });
          }
        }
      }
      this.acceptAll(candidates);
    }
  }

  private leftoverFor(side: Side, first: Item, second: Item) {
    const net = first.signed + second.signed;
    if (side !== 'statement' || net === 0) {
      return [];
    }
    const later = first.day > second.day ? first : second;
    const match = this.free('ledger')
      .filter((item) => item.signed === net && gap(item, later) <= REVERSAL_DAYS)
      .sort((left, right) => firstNonZero(gap(left, later) - gap(right, later), order(left, right)))
      .at(0);
    return match === undefined ? [] : [match];
  }

  emiFirst() {
    let progress = true;
    while (progress) {
      const statementPool = this.free('statement');
      const ledgerPool = this.free('ledger');
      const candidates: Candidate[] = [];
      for (const member of statementPool.filter(isEmiFamily)) {
        const statementNear = statementPool
          .filter((item) => gap(item, member) <= EXACT_DAYS)
          .sort((left, right) =>
            firstNonZero(
              Number(isEmiFamily(right)) - Number(isEmiFamily(left)),
              gap(left, member) - gap(right, member),
              order(left, right),
            ),
          )
          .slice(0, WINDOW_STATEMENT_POOL);
        const sums = subsetSums(statementNear);
        const ledgerNear = nearest(member, ledgerPool, CLUB_DAYS, EMI_LEDGER_POOL);
        for (let size = 1; size <= WINDOW_LEDGER_MAX; size += 1) {
          for (const ledgerSide of combinations(ledgerNear, size)) {
            const target = total(ledgerSide);
            for (let offset = -EMI_TOLERANCE; offset <= EMI_TOLERANCE; offset += 1) {
              const mask = sums.get(target + offset);
              if (mask === undefined || mask === 0) {
                continue;
              }
              const statementSide = statementNear.filter(
                (_, position) => (mask & (1 << position)) !== 0,
              );
              if (!statementSide.includes(member)) {
                continue;
              }
              const members = [...statementSide, ...ledgerSide];
              candidates.push({
                rank: [
                  -statementSide.filter(isEmiFamily).length,
                  Math.abs(offset),
                  members.length,
                  spreadOf(members),
                  member.day,
                ],
                kind: offset === 0 ? 'window' : 'emi_rounding',
                items: members,
              });
            }
          }
        }
      }
      progress = this.acceptAll(candidates) > 0;
    }
  }

  windows(approximate: boolean) {
    for (const days of WINDOW_DAYS) {
      let progress = true;
      while (progress) {
        const statementPool = this.free('statement');
        const ledgerPool = this.free('ledger');
        const candidates: Candidate[] = [];
        for (const anchor of ledgerPool) {
          const statementNear = nearest(anchor, statementPool, days, WINDOW_STATEMENT_POOL);
          if (statementNear.length === 0) {
            continue;
          }
          const sums = subsetSums(statementNear);
          const ledgerNear = nearest(anchor, ledgerPool, days, WINDOW_LEDGER_POOL - 1);
          for (let size = 0; size < WINDOW_LEDGER_MAX; size += 1) {
            for (const extra of combinations(ledgerNear, size)) {
              const ledgerSide = [anchor, ...extra];
              const target = total(ledgerSide);
              const tolerance = approximate ? EMI_TOLERANCE : 0;
              for (let offset = -tolerance; offset <= tolerance; offset += 1) {
                if (approximate && offset === 0) {
                  continue;
                }
                const mask = sums.get(target + offset);
                if (mask === undefined || mask === 0) {
                  continue;
                }
                const statementSide = statementNear.filter(
                  (_, position) => (mask & (1 << position)) !== 0,
                );
                if (approximate && !hasInstallment(statementSide)) {
                  continue;
                }
                const members = [...statementSide, ...ledgerSide];
                candidates.push({
                  rank: [Math.abs(offset), members.length, spreadOf(members), anchor.day],
                  kind: approximate ? 'emi_rounding' : 'window',
                  items: members,
                });
              }
            }
          }
        }
        progress = this.acceptAll(candidates) > 0;
      }
    }
  }

  nearPairs() {
    const ledger = this.free('ledger');
    const candidates: Candidate[] = [];
    for (const entry of this.free('statement')) {
      for (const other of ledger) {
        const difference = Math.abs(entry.amount - other.amount);
        const tolerance = Math.max(
          NEAR_MIN_TOLERANCE,
          Math.min(
            NEAR_MAX_TOLERANCE,
            Math.round(Math.max(entry.amount, other.amount) * NEAR_RATIO),
          ),
        );
        if (
          entry.direction === other.direction &&
          gap(entry, other) <= EXACT_DAYS &&
          difference <= tolerance
        ) {
          candidates.push({
            rank: [
              Math.round((difference * NEAR_RANK_SCALE) / entry.amount),
              gap(entry, other),
              entry.day,
            ],
            kind: 'near',
            items: [entry, other],
          });
        }
      }
    }
    this.acceptAll(candidates);
  }

  nearClubs() {
    const candidates: Candidate[] = [];
    const statementPool = this.free('statement');
    for (const anchor of this.free('ledger')) {
      const near = nearest(
        anchor,
        statementPool.filter((item) => item.direction === anchor.direction),
        EXACT_DAYS,
        NEAR_CLUB_POOL,
      );
      const tolerance = Math.max(
        NEAR_MIN_TOLERANCE,
        Math.min(NEAR_MAX_TOLERANCE, Math.round(anchor.amount * NEAR_CLUB_RATIO)),
      );
      for (let size = 2; size <= NEAR_CLUB_MAX_SIZE; size += 1) {
        for (const combo of combinations(near, size)) {
          const difference = Math.abs(total(combo) - anchor.signed);
          if (difference > tolerance) {
            continue;
          }
          const members = [...combo, anchor];
          candidates.push({
            rank: [difference, size, spreadOf(members), anchor.day],
            kind: 'near',
            items: members,
          });
        }
      }
    }
    this.acceptAll(candidates);
  }

  item(id: string) {
    return this.items.find((item) => item.id === id);
  }
}

const subsetSums = (pool: Item[]) => {
  const sums = new Map<number, number>([[0, 0]]);
  const bits = (mask: number) => {
    let count = 0;
    for (let value = mask; value !== 0; value &= value - 1) {
      count += 1;
    }
    return count;
  };
  for (const [position, item] of pool.entries()) {
    for (const [sum, mask] of [...sums.entries()]) {
      const next = sum + item.signed;
      const nextMask = mask | (1 << position);
      const existing = sums.get(next);
      if (existing === undefined || bits(nextMask) < bits(existing)) {
        sums.set(next, nextMask);
      }
    }
  }
  return sums;
};

const isFeeLike = (item: Item) =>
  item.direction === 'debit' &&
  (item.amount < TINY_AMOUNT || (item.amount <= FEE_MAX && FEE_PATTERN.test(item.description)));

const foldTarget = (matcher: Matcher, fee: Item) => {
  let best: { key: string; rank: number[] } | null = null;
  for (const group of matcher.groups) {
    for (const key of group.ledger) {
      const ledger = matcher.item(`l:${key}`);
      if (ledger?.direction !== fee.direction) {
        continue;
      }
      const distance = gap(ledger, fee);
      if (distance > EXACT_DAYS) {
        continue;
      }
      const rank = [distance, -ledger.amount];
      if (best === null || compareRank(rank, best.rank) < 0) {
        best = { key, rank };
      }
    }
  }
  return best?.key ?? null;
};

const adjustmentFor = (
  matcher: Matcher,
  group: MatchGroup,
  position: number,
): Suggestion | null => {
  if (group.difference === 0) {
    return null;
  }
  const fallback: Suggestion = {
    type: 'add_difference',
    amount: Math.abs(group.difference),
    direction: group.difference < 0 ? 'debit' : 'credit',
    date: group.statement
      .map((index) => matcher.item(`s:${String(index)}`)?.date ?? '')
      .reduce((latest, date) => (date > latest ? date : latest), ''),
    group: position,
  };
  const ledger = group.ledger
    .map((key) => matcher.item(`l:${key}`))
    .filter((item) => item !== undefined)
    .sort((left, right) => firstNonZero(right.amount - left.amount, order(left, right)))
    .find((item) => Math.sign(item.signed + group.difference) === Math.sign(item.signed));
  if (ledger === undefined) {
    return fallback;
  }
  return {
    type: 'adjust',
    ledger: ledger.key,
    from: ledger.amount,
    to: Math.abs(ledger.signed + group.difference),
    group: position,
  };
};

const redatesFor = (
  matcher: Matcher,
  group: MatchGroup,
  position: number,
  period: { start: number; end: number },
): Suggestion[] => {
  const statementDays = group.statement
    .map((index) => matcher.item(`s:${String(index)}`))
    .filter((item) => item !== undefined);
  if (statementDays.length === 0) {
    return [];
  }
  const inside = statementDays.every((item) => item.day >= period.start && item.day <= period.end);
  if (!inside) {
    return [];
  }
  const [initial] = statementDays;
  const latest = statementDays.reduce((last, item) => (item.day > last.day ? item : last), initial);
  const earliest = statementDays.reduce(
    (first, item) => (item.day < first.day ? item : first),
    initial,
  );
  return group.ledger.flatMap((key): Suggestion[] => {
    const ledger = matcher.item(`l:${key}`);
    if (ledger === undefined) {
      return [];
    }
    if (ledger.day > period.end) {
      return [{ type: 'redate', ledger: key, from: ledger.date, to: latest.date, group: position }];
    }
    if (ledger.day < period.start) {
      return [
        { type: 'redate', ledger: key, from: ledger.date, to: earliest.date, group: position },
      ];
    }
    return [];
  });
};

export const inPeriodLedgerMatches = (input: ReconcileInput) => {
  const matcher = new Matcher(input);
  matcher.wide = false;
  matcher.reversals(true);
  matcher.emiFirst();
  matcher.exactPairs();
  matcher.clubs(false);
  return matcher.groups.flatMap((group) => group.ledger);
};

export const reconcile = (input: ReconcileInput): Reconciliation => {
  const matcher = new Matcher(input);
  for (const wide of [false, true]) {
    matcher.wide = wide;
    matcher.reversals(true);
    matcher.emiFirst();
    matcher.exactPairs();
    matcher.clubs(false);
    matcher.reversals(false);
    matcher.windows(false);
  }
  for (const wide of [false, true]) {
    matcher.wide = wide;
    matcher.clubs(true);
    matcher.windows(true);
    matcher.nearPairs();
    matcher.nearClubs();
  }

  const period = { start: dayNumber(input.period.start), end: dayNumber(input.period.end) };
  const suggestions: Suggestion[] = [];
  for (const [position, group] of matcher.groups.entries()) {
    const adjustment = adjustmentFor(matcher, group, position);
    if (adjustment !== null) {
      suggestions.push(adjustment);
    }
    suggestions.push(...redatesFor(matcher, group, position, period));
  }
  for (const entry of matcher.free('statement')) {
    suggestions.push({
      type: 'add',
      statement: entry.index,
      foldInto: isFeeLike(entry) ? foldTarget(matcher, entry) : null,
    });
  }
  for (const entry of matcher.free('ledger')) {
    if (entry.day >= period.start && entry.day <= period.end) {
      suggestions.push({ type: 'not_on_statement', ledger: entry.key });
    }
  }

  const statementNet = input.statement.reduce(
    (sum, entry) => sum + signedAmount(entry.amount, entry.direction),
    0,
  );
  const matchedLedger = new Set(matcher.groups.flatMap((group) => group.ledger));
  const ledgerNet = input.ledger
    .filter((entry) => matchedLedger.has(entry.key))
    .reduce((sum, entry) => sum + signedAmount(entry.amount, entry.direction), 0);
  const ledgerByKey = new Map(input.ledger.map((entry) => [entry.key, entry]));
  const statementByIndex = new Map(input.statement.map((entry) => [entry.index, entry]));
  const applied = suggestions.reduce((sum, suggestion) => {
    if (suggestion.type === 'adjust') {
      const ledger = ledgerByKey.get(suggestion.ledger);
      return ledger === undefined
        ? sum
        : sum +
            signedAmount(suggestion.to, ledger.direction) -
            signedAmount(suggestion.from, ledger.direction);
    }
    if (suggestion.type === 'add_difference') {
      return sum + signedAmount(suggestion.amount, suggestion.direction);
    }
    if (suggestion.type === 'add') {
      const entry = statementByIndex.get(suggestion.statement);
      return entry === undefined ? sum : sum + signedAmount(entry.amount, entry.direction);
    }
    return sum;
  }, 0);

  return {
    groups: matcher.groups,
    suggestions,
    statementNet,
    ledgerNet,
    residual: statementNet - ledgerNet - applied,
  };
};
