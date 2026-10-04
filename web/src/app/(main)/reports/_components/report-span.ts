'use client';

import { useEffect, useState } from 'react';

import { parseAsString, useQueryStates } from 'nuqs';

const STORAGE_KEY = 'expense-tracker.report-span';

export type ReportSpan = { from: string; to: string };

export const readStoredSpan = (): ReportSpan | null => {
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
    return null;
  }
};

export const writeStoredSpan = (span: ReportSpan): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(span));
  } catch {}
};

export const isUsableSpan = (span: ReportSpan, boundaryIds: string[]): boolean => {
  const from = boundaryIds.indexOf(span.from);
  const to = boundaryIds.indexOf(span.to);
  return from !== -1 && to !== -1 && to > from;
};

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (next: ReportSpan) => {
    setSpan(next);
    writeStoredSpan(next);
  };

  return [span, update];
};

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const span = { from: query.from ?? fallback.from, to: query.to ?? fallback.to };

  const update = (next: ReportSpan) => {
    writeStoredSpan(next);
    void setQuery(next);
  };

  return [span, update];
};
