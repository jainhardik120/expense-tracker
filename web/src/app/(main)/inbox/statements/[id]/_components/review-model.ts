import { type RouterOutput } from '@/server/routers';

export type Review = RouterOutput['statementImports']['getReview'];
export type Suggestion = Review['suggestions'][number];
export type Addition = Extract<Suggestion, { type: 'add' | 'add_difference' }>;
export type LedgerRow = NonNullable<Review['ledger'][string]>;
type Group = Review['groups'][number];

export type AddKind = Addition['defaults']['statementKind'];

export type Decision = {
  accepted: boolean;
  mode: 'new' | 'fold';
  statementKind: AddKind;
  category: string;
  tags: string[];
  counterpartyAccountId: string | null;
};

export type Decisions = Partial<Record<string, Decision>>;

export const ROW_STATUSES = [
  'missing',
  'amount_differs',
  'outside_period',
  'clubbed',
  'split',
  'netted',
  'reversed',
  'exact',
] as const;

export type RowStatus = (typeof ROW_STATUSES)[number];

export type LedgerOnlyStatus = 'not_on_statement' | 'other_statement' | 'likely_next';

export const STATUS_LABELS: Record<RowStatus | LedgerOnlyStatus, string> = {
  missing: 'Missing',
  amount_differs: 'Amount differs',
  outside_period: 'Dated outside period',
  clubbed: 'Clubbed together',
  split: 'Split in ledger',
  netted: 'Netted over days',
  reversed: 'Charged and reversed',
  exact: 'Exact match',
  not_on_statement: 'Not on statement',
  other_statement: 'On another statement',
  likely_next: 'Likely next statement',
};

export const STATUS_TONES: Record<RowStatus | LedgerOnlyStatus, 'good' | 'action' | 'info'> = {
  missing: 'action',
  amount_differs: 'action',
  outside_period: 'info',
  clubbed: 'good',
  split: 'good',
  netted: 'good',
  reversed: 'good',
  exact: 'good',
  not_on_statement: 'action',
  other_statement: 'info',
  likely_next: 'info',
};

export type ReviewRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: 'debit' | 'credit';
  status: RowStatus;
  ledger: LedgerRow[];
  suggestions: Suggestion[];
  addition: Addition | null;
  groupKey: string;
};

export type LedgerOnlyRow = {
  id: string;
  date: string;
  label: string;
  tags: string[];
  amount: number;
  direction: 'debit' | 'credit';
  status: LedgerOnlyStatus;
  matchedOn: { id: string; periodEnd: string } | null;
};

const PAISE = 100;

export const toPaise = (value: number) => Math.round(value * PAISE);

export const fromPaise = (value: number) => value / PAISE;

export const signed = (amount: number, direction: 'debit' | 'credit') =>
  direction === 'debit' ? -amount : amount;

const isAddition = (suggestion: Suggestion): suggestion is Addition =>
  suggestion.type === 'add' || suggestion.type === 'add_difference';

export const initialDecisions = (review: Review): Decisions =>
  Object.fromEntries(
    review.suggestions.map((suggestion): [string, Decision] => [
      suggestion.id,
      {
        accepted: suggestion.type !== 'not_on_statement',
        mode: isAddition(suggestion) && suggestion.foldInto !== null ? 'fold' : 'new',
        statementKind: isAddition(suggestion) ? suggestion.defaults.statementKind : 'expense',
        category: isAddition(suggestion) ? suggestion.defaults.category : '',
        tags: isAddition(suggestion) ? suggestion.defaults.tags : [],
        counterpartyAccountId: isAddition(suggestion)
          ? suggestion.defaults.counterpartyAccountId
          : null,
      },
    ]),
  );

export const effectOf = (suggestion: Suggestion, ledger: Review['ledger'], periodEnd: string) => {
  if (isAddition(suggestion)) {
    return toPaise(signed(suggestion.amount, suggestion.direction));
  }
  if (suggestion.type === 'adjust') {
    const row = ledger[suggestion.ledger];
    return row === undefined
      ? 0
      : toPaise(signed(suggestion.to, row.direction)) -
          toPaise(signed(suggestion.from, row.direction));
  }
  if (suggestion.type === 'redate') {
    const row = ledger[suggestion.ledger];
    return row !== undefined && row.date > periodEnd && suggestion.to <= periodEnd
      ? toPaise(signed(row.amount, row.direction))
      : 0;
  }
  return 0;
};

const GROUP_STATUS: Record<Group['kind'], RowStatus> = {
  exact: 'exact',
  ledger_club: 'clubbed',
  statement_club: 'split',
  window: 'netted',
  reversal: 'reversed',
  near: 'amount_differs',
  emi_rounding: 'amount_differs',
};

const groupStatus = (group: Group, suggestions: Suggestion[]): RowStatus => {
  if (suggestions.some((suggestion) => suggestion.type === 'adjust' || isAddition(suggestion))) {
    return 'amount_differs';
  }
  if (suggestions.some((suggestion) => suggestion.type === 'redate')) {
    return 'outside_period';
  }
  return GROUP_STATUS[group.kind];
};

const ledgerOnlyStatus = (
  suggestion: Extract<Suggestion, { type: 'not_on_statement' }>,
): LedgerOnlyStatus => {
  if (suggestion.matchedOn !== null) {
    return 'other_statement';
  }
  return suggestion.likelyNext ? 'likely_next' : 'not_on_statement';
};

const rowStatus = (
  addition: Addition | null,
  group: Group | undefined,
  shared: Suggestion[],
): RowStatus => {
  if (addition !== null || group === undefined) {
    return 'missing';
  }
  return groupStatus(group, shared);
};

export const buildReviewRows = (review: Review): ReviewRow[] => {
  const groupSuggestions = new Map<number, Suggestion[]>();
  for (const suggestion of review.suggestions) {
    if ('group' in suggestion) {
      const list = groupSuggestions.get(suggestion.group) ?? [];
      list.push(suggestion);
      groupSuggestions.set(suggestion.group, list);
    }
  }
  const groupOfRow = new Map<number, number>();
  for (const [position, group] of review.groups.entries()) {
    for (const index of group.rows) {
      groupOfRow.set(index, position);
    }
  }
  const additionOfRow = new Map(
    review.suggestions.flatMap((suggestion) =>
      suggestion.type === 'add' ? [[suggestion.row, suggestion] as const] : [],
    ),
  );

  return review.rows
    .map((row, index): ReviewRow => {
      const addition = additionOfRow.get(index) ?? null;
      const position = groupOfRow.get(index);
      const group = position === undefined ? undefined : review.groups.at(position);
      const shared = position === undefined ? [] : (groupSuggestions.get(position) ?? []);
      const ownsShared = group?.rows.at(0) === index;
      return {
        id: `row:${String(index)}`,
        date: row.date,
        description: row.description,
        amount: row.amount,
        direction: row.direction,
        status: rowStatus(addition, group, shared),
        ledger: (group?.ledger ?? []).flatMap((key) => {
          const ledgerRow = review.ledger[key];
          return ledgerRow === undefined ? [] : [ledgerRow];
        }),
        suggestions: [...(addition === null ? [] : [addition]), ...(ownsShared ? shared : [])],
        addition: addition ?? (ownsShared ? (shared.find(isAddition) ?? null) : null),
        groupKey: position === undefined ? `row:${String(index)}` : `group:${String(position)}`,
      };
    })
    .toSorted((left, right) => left.date.localeCompare(right.date));
};

export const groupTogether = (rows: ReviewRow[]) => {
  const firstDate = new Map<string, string>();
  for (const row of rows) {
    const current = firstDate.get(row.groupKey);
    if (current === undefined || row.date < current) {
      firstDate.set(row.groupKey, row.date);
    }
  }
  const compare = (left: ReviewRow, right: ReviewRow) => {
    const byStart = (firstDate.get(left.groupKey) ?? left.date).localeCompare(
      firstDate.get(right.groupKey) ?? right.date,
    );
    if (byStart !== 0) {
      return byStart;
    }
    const byGroup = left.groupKey.localeCompare(right.groupKey);
    return byGroup === 0 ? left.date.localeCompare(right.date) : byGroup;
  };
  return rows.toSorted(compare);
};

const GROUP_TINTS = [
  'bg-sky-500/8 dark:bg-sky-400/10',
  'bg-amber-500/8 dark:bg-amber-400/10',
  'bg-violet-500/8 dark:bg-violet-400/10',
  'bg-orange-500/8 dark:bg-orange-400/10',
  'bg-indigo-500/8 dark:bg-indigo-400/10',
  'bg-fuchsia-500/8 dark:bg-fuchsia-400/10',
];

export const groupTints = (rows: ReviewRow[]) => {
  const sizes = new Map<string, number>();
  for (const row of rows) {
    sizes.set(row.groupKey, (sizes.get(row.groupKey) ?? 0) + 1);
  }
  const tints = new Map<string, string>();
  for (const row of rows) {
    if ((sizes.get(row.groupKey) ?? 0) > 1 && !tints.has(row.groupKey)) {
      tints.set(row.groupKey, GROUP_TINTS[tints.size % GROUP_TINTS.length] ?? '');
    }
  }
  return tints;
};

export const buildLedgerOnlyRows = (review: Review): LedgerOnlyRow[] =>
  review.suggestions
    .flatMap((suggestion): LedgerOnlyRow[] => {
      if (suggestion.type !== 'not_on_statement') {
        return [];
      }
      const row = review.ledger[suggestion.ledger];
      return row === undefined
        ? []
        : [
            {
              id: suggestion.id,
              date: row.date,
              label: row.label,
              tags: row.tags,
              amount: row.amount,
              direction: row.direction,
              status: ledgerOnlyStatus(suggestion),
              matchedOn: suggestion.matchedOn,
            },
          ];
    })
    .toSorted((left, right) => left.date.localeCompare(right.date));
