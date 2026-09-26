'use client';

/**
 * The page size you last chose for a table, remembered across visits.
 *
 * The URL stays the single source of truth -- that is what keeps a filtered
 * table linkable -- and storage only seeds it when the URL says nothing.
 */
const STORAGE_PREFIX = 'expense-tracker.page-size.';

export const readStoredPageSize = (key: string): number | null => {
  // Called from effects, but guard anyway: this module is imported by components
  // that render on the server.
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw === null) {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    // Private-mode storage throws, and a hand-edited value can be anything.
    return null;
  }
};

export const writeStoredPageSize = (key: string, pageSize: number): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(pageSize));
  } catch {
    // Storage full or blocked; remembering a page size is not worth an error.
  }
};
