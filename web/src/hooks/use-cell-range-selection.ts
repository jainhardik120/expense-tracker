'use client';

import * as React from 'react';

interface CellRef {
  row: number;
  col: number;
}

export interface CellRange {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CellSelectionStats {
  count: number;
  numeric: number;
  sum: number;
  average: number;
}

const CELL_SELECTOR = 'td[data-cell-row]';

const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, [role="checkbox"], [role="menuitem"]';

const cellAt = (target: EventTarget | null): CellRef | null => {
  const cell = target instanceof Element ? target.closest(CELL_SELECTOR) : null;
  if (!(cell instanceof HTMLElement)) {
    return null;
  }
  const row = Number(cell.dataset['cellRow']);
  const col = Number(cell.dataset['cellCol']);
  return Number.isNaN(row) || Number.isNaN(col) ? null : { row, col };
};

const toRange = (anchor: CellRef, focus: CellRef): CellRange => ({
  top: Math.min(anchor.row, focus.row),
  bottom: Math.max(anchor.row, focus.row),
  left: Math.min(anchor.col, focus.col),
  right: Math.max(anchor.col, focus.col),
});

const asNumber = (text: string): number | null => {
  const cleaned = text.replaceAll(/[,\s₹]/gu, '');
  if (cleaned === '') {
    return null;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

const cellsIn = (container: HTMLElement | null, range: CellRange): HTMLElement[][] => {
  if (container === null) {
    return [];
  }
  const rows: HTMLElement[][] = [];
  for (let row = range.top; row <= range.bottom; row++) {
    const line: HTMLElement[] = [];
    for (let col = range.left; col <= range.right; col++) {
      const cell = container.querySelector<HTMLElement>(
        `td[data-cell-row="${row}"][data-cell-col="${col}"]`,
      );
      if (cell !== null) {
        line.push(cell);
      }
    }
    rows.push(line);
  }
  return rows;
};

const asTabSeparated = (lines: HTMLElement[][]) =>
  lines
    .map((line) => line.map((cell) => cell.innerText.replaceAll('\n', ' ').trim()).join('\t'))
    .join('\n');

export const useCellRangeSelection = ({
  enabled,
  containerRef,
}: {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
}) => {
  const [anchor, setAnchor] = React.useState<CellRef | null>(null);
  const [focus, setFocus] = React.useState<CellRef | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [stats, setStats] = React.useState<CellSelectionStats | null>(null);

  const range = React.useMemo(
    () => (anchor === null || focus === null ? null : toRange(anchor, focus)),
    [anchor, focus],
  );

  const clear = React.useCallback(() => {
    setAnchor(null);
    setFocus(null);
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      clear();
    }
  }, [enabled, clear]);

  React.useEffect(() => {
    if (range === null) {
      setStats(null);
      return;
    }
    const values: number[] = [];
    let count = 0;
    for (const line of cellsIn(containerRef.current, range)) {
      for (const cell of line) {
        count++;
        const value = asNumber(cell.innerText);
        if (value !== null) {
          values.push(value);
        }
      }
    }
    const sum = values.reduce((total, value) => total + value, 0);
    setStats({
      count,
      numeric: values.length,
      sum,
      average: values.length === 0 ? 0 : sum / values.length,
    });
  }, [range, containerRef]);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) {
        return;
      }
      if ((event.target as Element).closest(INTERACTIVE_SELECTOR) !== null) {
        return;
      }
      const cell = cellAt(event.target);
      if (cell === null) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey && anchor !== null) {
        setFocus(cell);
      } else {
        setAnchor(cell);
        setFocus(cell);
      }
      setIsDragging(true);
    },
    [enabled, anchor],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!isDragging) {
        return;
      }
      const cell = cellAt(event.target);
      if (cell !== null && (cell.row !== focus?.row || cell.col !== focus.col)) {
        setFocus(cell);
      }
    },
    [isDragging, focus],
  );

  const onPointerUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  const isSelected = React.useCallback(
    (row: number, col: number) =>
      range !== null &&
      row >= range.top &&
      row <= range.bottom &&
      col >= range.left &&
      col <= range.right,
    [range],
  );

  React.useEffect(() => {
    if (!enabled || range === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target !== null && target.closest('input, textarea, [contenteditable="true"]') !== null) {
        return;
      }
      if (event.key === 'Escape') {
        event.stopPropagation();
        clear();
        return;
      }
      if (event.key.toLowerCase() === 'c' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void navigator.clipboard.writeText(asTabSeparated(cellsIn(containerRef.current, range)));
      }
    };
    const onPointerDownAway = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node) !== true) {
        clear();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDownAway);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDownAway);
    };
  }, [enabled, range, clear, containerRef]);

  return {
    isSelected,
    stats,
    clear,
    containerHandlers: { onPointerDown, onPointerMove, onPointerUp },
  };
};
