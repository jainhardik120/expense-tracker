'use client';

import * as React from 'react';

/** A cell's place in the table, counted from the top left of the body. */
interface CellRef {
  row: number;
  col: number;
}

/** The rectangle between two cells, inclusive of both. */
export interface CellRange {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CellSelectionStats {
  /** How many cells are in the rectangle. */
  count: number;
  /** How many of them read as a number. */
  numeric: number;
  sum: number;
  average: number;
}

const CELL_SELECTOR = 'td[data-cell-row]';

// A row carries buttons, links and tick boxes; a press on one of those is meant
// for the control, not for the cell it happens to sit in.
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

/**
 * What a cell's text is worth, or nothing if it is not a number.
 *
 * Read from what is on the screen rather than from the row behind it, because
 * what is on the screen is what was selected: a column showing a rounded figure
 * should total the figures it is showing. Separators and a currency symbol are
 * stripped first; a stray dash, which this table uses for "nothing here", is
 * not a number and is left out of the sum rather than counted as zero.
 */
const asNumber = (text: string): number | null => {
  const cleaned = text.replaceAll(/[,\s₹]/gu, '');
  if (cleaned === '') {
    return null;
  }
  // `Number` rather than a pattern: it already knows what a number looks like,
  // and anything else -- a dash, a name, a date -- comes back as NaN.
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

/** Tab separated, which is what a spreadsheet reads back in as columns. */
const asTabSeparated = (lines: HTMLElement[][]) =>
  lines
    .map((line) => line.map((cell) => cell.innerText.replaceAll('\n', ' ').trim()).join('\t'))
    .join('\n');

/**
 * Select a rectangle of cells with the pointer, and copy it.
 *
 * The table is read far more often than it is corrected, and reading it means
 * asking questions of a few rows at a time -- what do these eight come to,
 * what is the average of a month's groceries. A spreadsheet answers that by
 * letting you sweep over the cells and reading the total off the bottom, which
 * is what this is.
 *
 * Driven by one listener on the table rather than handlers on every cell: there
 * are five hundred of them on a full page, and they already say where they are.
 */
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

  // Everything below is switched off wholesale when the table is being edited,
  // where a press on a cell means "open this" and a sweep would fight it.
  React.useEffect(() => {
    if (!enabled) {
      clear();
    }
  }, [enabled, clear]);

  // What the selection comes to, worked out from the cells themselves once the
  // rectangle settles rather than while it is being swept out.
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
      // Sweeping the pointer over text would otherwise select the text as well
      // as the cells, and the two highlights on top of each other are illegible.
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
      // Only when it has actually crossed into another cell: a sweep reports a
      // position every few pixels, and re-rendering the table for each of them
      // is work that changes nothing.
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

  // Copying and clearing are watched for on the document: the selection is not
  // a focused control, so there is nothing for a key to arrive at otherwise.
  React.useEffect(() => {
    if (!enabled || range === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      // Not every event target is an element -- the document itself receives
      // one when nothing is focused -- and asking a non-element what it is
      // inside of throws rather than answering.
      const target = event.target instanceof Element ? event.target : null;
      if (target !== null && target.closest('input, textarea, [contenteditable="true"]') !== null) {
        return;
      }
      if (event.key === 'Escape') {
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
