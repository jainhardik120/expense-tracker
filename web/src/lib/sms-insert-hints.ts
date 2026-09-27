/**
 * Guessing how a message should be filed, from how messages like it were filed
 * before.
 *
 * A message that has already been entered remembers the statement it became, so
 * the history of (message -> statement) pairs is the only training data there
 * is. Three signals come out of it:
 *
 *   - the account, keyed on the card's last four digits where the message has
 *     them and on the bank name otherwise;
 *   - the category, keyed on the merchant;
 *   - the tags, also keyed on the merchant.
 *
 * Only the ten most recent pairs for a key are counted, so that a merchant
 * re-categorised last month outranks the way it was filed all last year. Within
 * those ten, the most frequent value wins.
 *
 * The single-message version of this lives in the smsNotifications router and
 * asks the database one key at a time. Bulk insert needs a hint for every
 * pending message at once, so the history is read in one query and the keying
 * happens here instead — same answers, one round trip.
 */

/** A message that was already entered, paired with the statement it became. */
export type LinkedHistoryEntry = {
  bankName: string;
  accountLast4: string | null;
  merchant: string | null;
  accountId: string | null;
  category: string | null;
  tags: string[] | null;
};

/** The fields of a pending message that a hint can be keyed on. */
export type HintSubject = {
  id: string;
  bankName: string;
  accountLast4: string | null;
  merchant: string | null;
};

export type InsertHints = {
  /** Candidate accounts, most frequently used first. */
  accountIds: string[];
  /** Candidate categories, most frequently used first. */
  categories: string[];
  /** Candidate tags, most frequently used first. */
  tags: string[];
};

/** How many recent pairs a key is allowed to learn from. */
export const HISTORY_WINDOW = 10;

const EMPTY_HINTS: InsertHints = { accountIds: [], categories: [], tags: [] };

/**
 * Whether the last-four field is usable as a key. Banks send placeholders like
 * "XXXX" and "0000" for accounts they do not want to name, and those would
 * otherwise collide into one very confident, very wrong bucket.
 */
export const getIsUsableLast4 = (accountLast4: string | null): accountLast4 is string => {
  if (accountLast4 === null) {
    return false;
  }
  const parsed = Number.parseInt(accountLast4, 10);
  return !Number.isNaN(parsed) && parsed > 0;
};

/** Values ordered by how often they occur, ties broken by how recently. */
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

/**
 * Builds a hint for each subject from the linked history.
 *
 * `history` must be ordered newest first — the window that decides which pairs
 * count is taken off the front.
 */
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
    // The last four digits are the stronger signal; the bank name is the
    // fallback for messages that do not carry them.
    const accountSource = getIsUsableLast4(subject.accountLast4)
      ? (byLast4.get(subject.accountLast4) ?? [])
      : (byBank.get(subject.bankName) ?? []);

    const accountIds = rankByFrequency(
      accountSource
        .slice(0, HISTORY_WINDOW)
        .map((entry) => entry.accountId)
        .filter((accountId): accountId is string => accountId !== null),
    );

    // Category and tags only have a key when the message names a merchant.
    const merchantSource =
      subject.merchant === null ? [] : (byMerchant.get(subject.merchant) ?? []).slice(0, HISTORY_WINDOW);

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

/**
 * The tags worth offering in the grid's tag menu, most used first.
 *
 * Drawn from the linked history rather than from every tag on every statement,
 * because the full list runs to hundreds of entries — mostly raw bank narration
 * left behind by CSV imports ("by debit card-OTHPOS420218971072Innoviti POS
 * GURGAON--") — and a menu that long is not a menu. What remains is the set the
 * user has actually chosen for messages like these.
 */
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
