import { formatCurrency } from '@/lib/format';

export const NUMBER_FILTER_OPERATORS = [
  'gt',
  'gte',
  'lt',
  'lte',
  'eq',
  'ne',
  'between',
  'nonzero',
  'zero',
] as const;

export type NumberFilterOperator = (typeof NUMBER_FILTER_OPERATORS)[number];

export type NumberFilter = { operator: NumberFilterOperator; values: number[] };

export const NUMBER_FILTER_LABELS: Record<NumberFilterOperator, string> = {
  gt: 'is more than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  eq: 'is exactly',
  ne: 'is not',
  between: 'is between',
  nonzero: 'is not zero',
  zero: 'is zero',
};

const ARITY: Record<NumberFilterOperator, number> = {
  gt: 1,
  gte: 1,
  lt: 1,
  lte: 1,
  eq: 1,
  ne: 1,
  between: 2,
  nonzero: 0,
  zero: 0,
};

export const operandCount = (operator: NumberFilterOperator): number => ARITY[operator];

const isOperator = (value: string): value is NumberFilterOperator =>
  (NUMBER_FILTER_OPERATORS as readonly string[]).includes(value);

export const parseNumberFilter = (
  raw: readonly string[] | null | undefined,
): NumberFilter | null => {
  if (raw === null || raw === undefined || raw.length === 0) {
    return null;
  }
  const [operator, ...rest] = raw;
  if (!isOperator(operator) || rest.length !== ARITY[operator]) {
    return null;
  }
  const values = rest.map((value) => (value.trim() === '' ? Number.NaN : Number(value)));
  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  if (operator === 'between') {
    const [low, high] = values;
    return { operator, values: low <= high ? [low, high] : [high, low] };
  }
  return { operator, values };
};

export const serializeNumberFilter = (filter: NumberFilter): string[] => [
  filter.operator,
  ...filter.values.map(String),
];

export const matchesNumberFilter = ({ operator, values }: NumberFilter, value: number): boolean => {
  const [first, second] = values;
  switch (operator) {
    case 'gt':
      return value > first;
    case 'gte':
      return value >= first;
    case 'lt':
      return value < first;
    case 'lte':
      return value <= first;
    case 'eq':
      return value === first;
    case 'ne':
      return value !== first;
    case 'between':
      return value >= first && value <= second;
    case 'nonzero':
      return value !== 0;
    case 'zero':
    default:
      return value === 0;
  }
};

const SYMBOLS: Partial<Record<NumberFilterOperator, string>> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  eq: '=',
  ne: '≠',
};

export const describeNumberFilter = ({ operator, values }: NumberFilter): string => {
  if (operator === 'between') {
    return `${formatCurrency(values[0])} – ${formatCurrency(values[1])}`;
  }
  if (operator === 'nonzero') {
    return 'not zero';
  }
  if (operator === 'zero') {
    return 'zero';
  }
  return `${SYMBOLS[operator] ?? ''} ${formatCurrency(values[0])}`;
};
