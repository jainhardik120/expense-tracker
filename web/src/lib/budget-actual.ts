type ActualStatement = {
  costAmount: number;
  category: string | null;
  tags: string[];
  emiId: string | null;
  emiName: string | null;
  installment: number | null;
};

export type ActualGroup = {
  key: string;
  label: string;
  amount: number;
  count: number;
  unitAmount?: number;
};

const MAX_GROUPS = 4;
const OTHER_PAYMENTS = 'Other payments';

const groupBy = (
  statements: ActualStatement[],
  identify: (statement: ActualStatement) => { key: string; label: string; unitAmount?: number },
): ActualGroup[] => {
  const groups = new Map<string, ActualGroup>();
  for (const statement of statements) {
    const identity = identify(statement);
    const group = groups.get(identity.key) ?? { ...identity, amount: 0, count: 0 };
    group.amount += statement.costAmount;
    group.count += 1;
    groups.set(identity.key, group);
  }
  return [...groups.values()];
};

const compact = (groups: ActualGroup[], otherLabel: string): ActualGroup[] => {
  const ordered = [...groups].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  if (ordered.length <= MAX_GROUPS) {
    return ordered;
  }
  const rest = ordered.slice(MAX_GROUPS - 1);
  return [
    ...ordered.slice(0, MAX_GROUPS - 1),
    {
      key: 'remainder',
      label: otherLabel,
      amount: rest.reduce((sum, group) => sum + group.amount, 0),
      count: rest.reduce((sum, group) => sum + group.count, 0),
    },
  ];
};

const groupByTags = (statements: ActualStatement[], excluded: Set<string>): ActualGroup[] => {
  let remaining = statements;
  const groups: ActualGroup[] = [];
  while (remaining.length > 0) {
    const weights = new Map<string, number>();
    for (const statement of remaining) {
      for (const tag of new Set(statement.tags.filter((value) => !excluded.has(value)))) {
        weights.set(tag, (weights.get(tag) ?? 0) + Math.abs(statement.costAmount));
      }
    }
    const largest = [...weights]
      .sort((a, b) => {
        const difference = b[1] - a[1];
        return difference === 0 ? a[0].localeCompare(b[0]) : difference;
      })
      .at(0)?.[0];
    if (largest === undefined) {
      const label = remaining.every((statement) => statement.tags.length === 0)
        ? 'Untagged'
        : OTHER_PAYMENTS;
      groups.push(...groupBy(remaining, () => ({ key: 'untagged', label })));
      break;
    }
    const claimed = remaining.filter((statement) => statement.tags.includes(largest));
    groups.push(...groupBy(claimed, () => ({ key: `tag:${largest}`, label: largest })));
    remaining = remaining.filter((statement) => !statement.tags.includes(largest));
  }
  return groups;
};

const amountGroups = (statements: ActualStatement[]) =>
  groupBy(statements, (statement) => ({
    key: `amount:${statement.costAmount.toFixed(2)}`,
    label: 'Payments',
    unitAmount: statement.costAmount,
  }));

const positiveGroups = (statements: ActualStatement[], allocationKind: string): ActualGroup[] => {
  if (statements.length === 0) {
    return [];
  }
  const first = statements[0];
  if (first.emiId !== null && statements.every((statement) => statement.emiId === first.emiId)) {
    return groupBy(statements, (statement) =>
      statement.installment === 0
        ? { key: 'fees', label: 'Processing fees' }
        : { key: 'instalments', label: 'Instalments paid' },
    );
  }

  const byAmount = amountGroups(statements);
  if (allocationKind === 'monthly' && byAmount.length <= MAX_GROUPS - 1) {
    return byAmount;
  }
  const categories = groupBy(statements, (statement) => ({
    key: `category:${statement.category ?? ''}`,
    label: statement.category ?? 'Uncategorised',
  }));
  if (categories.length > 2) {
    return compact(categories, 'Other categories');
  }

  const tags = new Set(statements.flatMap((statement) => statement.tags));
  const universal = new Set(
    [...tags].filter((tag) => statements.every((statement) => statement.tags.includes(tag))),
  );
  if (tags.size > universal.size) {
    return compact(groupByTags(statements, universal), OTHER_PAYMENTS);
  }
  if (statements.some((statement) => statement.emiId !== null)) {
    return compact(
      groupBy(statements, (statement) => {
        if (statement.emiId === null) {
          return { key: 'direct', label: 'Direct payments' };
        }
        const name = statement.emiName ?? 'EMI';
        return {
          key: `emi:${statement.emiId}`,
          label: `${name} payments`,
        };
      }),
      OTHER_PAYMENTS,
    );
  }
  if (byAmount.length <= MAX_GROUPS - 1) {
    return byAmount;
  }
  const ordered = [...statements].sort((a, b) => b.costAmount - a.costAmount);
  return [
    { key: 'largest', label: 'Largest payment', amount: ordered[0].costAmount, count: 1 },
    ...groupBy(ordered.slice(1), () => ({ key: 'other', label: OTHER_PAYMENTS })),
  ];
};

export const summariseActual = (
  statements: ActualStatement[],
  allocationKind: string,
): ActualGroup[] => {
  const positive = statements.filter((statement) => statement.costAmount > 0);
  const negative = statements.filter((statement) => statement.costAmount < 0);
  const credits = compact(groupByTags(negative, new Set()), 'Other credits').map((group) => ({
    ...group,
    key: `credit:${group.key}`,
  }));
  return [...positiveGroups(positive, allocationKind), ...credits];
};
