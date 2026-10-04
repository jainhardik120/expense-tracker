export type LinkedHistoryEntry = {
  bankName: string;
  accountLast4: string | null;
  merchant: string | null;
  accountId: string | null;
  category: string | null;
  tags: string[] | null;
};

export type HintSubject = {
  id: string;
  bankName: string;
  accountLast4: string | null;
  merchant: string | null;
};

export type InsertHints = {
  accountIds: string[];
  categories: string[];
  tags: string[];
};

export const HISTORY_WINDOW = 10;

const EMPTY_HINTS: InsertHints = { accountIds: [], categories: [], tags: [] };

export const getIsUsableLast4 = (accountLast4: string | null): accountLast4 is string => {
  if (accountLast4 === null) {
    return false;
  }
  const parsed = Number.parseInt(accountLast4, 10);
  return !Number.isNaN(parsed) && parsed > 0;
};

const rankByFrequency = (values: string[]): string[] => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
};

const groupBy = <T>(entries: T[], keyOf: (entry: T) => string | null): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (key === null) {
      continue;
    }
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [entry]);
    } else {
      group.push(entry);
    }
  }
  return groups;
};

export const buildInsertHints = (
  history: LinkedHistoryEntry[],
  subjects: HintSubject[],
): Map<string, InsertHints> => {
  const byLast4 = groupBy(history, (entry) =>
    getIsUsableLast4(entry.accountLast4) ? entry.accountLast4 : null,
  );
  const byBank = groupBy(history, (entry) => entry.bankName);
  const byMerchant = groupBy(history, (entry) => entry.merchant);

  const hintsById = new Map<string, InsertHints>();

  for (const subject of subjects) {
    const accountSource = getIsUsableLast4(subject.accountLast4)
      ? (byLast4.get(subject.accountLast4) ?? [])
      : (byBank.get(subject.bankName) ?? []);

    const accountIds = rankByFrequency(
      accountSource
        .slice(0, HISTORY_WINDOW)
        .map((entry) => entry.accountId)
        .filter((accountId): accountId is string => accountId !== null),
    );

    const merchantSource =
      subject.merchant === null
        ? []
        : (byMerchant.get(subject.merchant) ?? []).slice(0, HISTORY_WINDOW);

    const categories = rankByFrequency(
      merchantSource
        .map((entry) => entry.category)
        .filter((category): category is string => category !== null && category !== ''),
    );

    const tags = rankByFrequency(
      merchantSource.flatMap((entry) => entry.tags ?? []).filter((tag) => tag !== ''),
    );

    hintsById.set(subject.id, { accountIds, categories, tags });
  }

  return hintsById;
};

export const collectTagVocabulary = (history: LinkedHistoryEntry[]): string[] => {
  const counts = new Map<string, number>();
  for (const entry of history) {
    for (const tag of entry.tags ?? []) {
      if (tag !== '') {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
  }
  return [...counts.keys()].sort((a, b) => {
    const byCount = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    return byCount === 0 ? a.localeCompare(b) : byCount;
  });
};

export const getHintsFor = (
  hintsById: Map<string, InsertHints>,
  notificationId: string,
): InsertHints => hintsById.get(notificationId) ?? EMPTY_HINTS;
