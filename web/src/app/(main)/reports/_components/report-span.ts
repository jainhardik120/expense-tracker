'use client';

import { useEffect, useState } from 'react';

import { parseAsString, useQueryStates } from 'nuqs';

const STORAGE_KEY = 'expense-tracker.report-span';

export type ReportSpan = { from: string; to: string };

/**
 * The last span you looked at, remembered across pages and reloads.
 *
 * The report, the download dialog and the template editor all ask the same
 * question, and answering it three times a session is friction for something
 * that changes maybe once a month. Boundary ids are stable, so the choice is
 * stored rather than the dates.
 *
 * A URL parameter still wins where one exists: a link to a particular span has
 * to open that span, not whatever the recipient last chose.
 */
export const readStoredSpan = (): ReportSpan | null => {
  // Called from effects and event handlers, but guard anyway — this module is
  // imported by components that render on the server.
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const { from, to } = parsed as Partial<ReportSpan>;
    return typeof from === 'string' && typeof to === 'string' ? { from, to } : null;
  } catch {
    // Private-mode storage throws, and a hand-edited value can be anything.
    // Neither is worth failing a page render over.
    return null;
  }
};

export const writeStoredSpan = (span: ReportSpan): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(span));
  } catch {
    // Storage full or blocked; remembering the span is not worth an error.
  }
};

/**
 * A stored span is only usable while both of its boundaries still exist and
 * still run in order — a boundary can be deleted or moved after it was stored,
 * and a span pointing at a missing one renders nothing at all.
 */
export const isUsableSpan = (span: ReportSpan, boundaryIds: string[]): boolean => {
  const from = boundaryIds.indexOf(span.from);
  const to = boundaryIds.indexOf(span.to);
  return from !== -1 && to !== -1 && to > from;
};

/**
 * The span to start from: what was stored if it still fits the boundaries,
 * otherwise the fallback.
 *
 * Resolved in an effect rather than during render. Reading localStorage while
 * rendering makes the server and client disagree on first paint, and React
 * discards the whole tree when they do.
 */
export const useStoredSpan = (
  boundaryIds: string[],
  fallback: ReportSpan,
): [ReportSpan, (next: ReportSpan) => void] => {
  const [span, setSpan] = useState<ReportSpan>(fallback);

  useEffect(() => {
    const stored = readStoredSpan();
    if (stored !== null && isUsableSpan(stored, boundaryIds)) {
      setSpan(stored);
    }
    // Boundary ids are derived from props that do not change while mounted, and
    // re-running this would overwrite a choice the user just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (next: ReportSpan) => {
    setSpan(next);
    writeStoredSpan(next);
  };

  return [span, update];
};

/**
 * The same thing for the two views that keep the span in the URL.
 *
 * The URL stays the single source of truth — that is what makes a report
 * linkable — and storage only seeds it when the URL says nothing. Seeding
 * replaces the history entry rather than pushing one, so arriving at the page
 * does not leave a back-button step that goes nowhere visible.
 */
export const useSpanQueryState = (
  boundaryIds: string[],
  fallback: ReportSpan,
): [ReportSpan, (next: ReportSpan) => void] => {
  const [query, setQuery] = useQueryStates({ from: parseAsString, to: parseAsString });

  useEffect(() => {
    if (query.from !== null && query.to !== null) {
      return;
    }
    const stored = readStoredSpan();
    const seed = stored !== null && isUsableSpan(stored, boundaryIds) ? stored : fallback;
    void setQuery(seed, { history: 'replace' });
    // Only on mount: this seeds an empty URL, and re-running it would fight the
    // user's own selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const span = { from: query.from ?? fallback.from, to: query.to ?? fallback.to };

  const update = (next: ReportSpan) => {
    writeStoredSpan(next);
    void setQuery(next);
  };

  return [span, update];
};
