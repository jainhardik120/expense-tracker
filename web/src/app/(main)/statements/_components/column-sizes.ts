/**
 * How the statements grid divides up the page.
 *
 * These are shares, not widths. The grid fills its container and gives each
 * column a piece of it in proportion to the number here, so the list reflows
 * with the window the way the `<table>` it replaced did -- a table is told
 * `width: 100%` and works the rest out itself, which a virtualised grid cannot
 * do because the browser never has all the rows to measure.
 *
 * The numbers are the widths the table settled on at full screen, so the
 * proportions are the table's own: a date column half again as wide as the
 * rest, and the rest equal. Any two of them keep that ratio at every window
 * size.
 *
 * `MIN` is where giving way stops and scrolling sideways starts, which is the
 * last thing a table does before its columns become unreadable.
 *
 * Stated once so reading and correcting cannot drift apart: a column that
 * changed width the moment editing started would move out from under the
 * pointer.
 */
export const STATEMENT_COLUMN_SIZE = {
  /** The tick box. A fixed width: it is the same box on a phone. */
  select: 60,
  /** Wide enough for "September 29, 2026 at 11:36 AM" at full screen. */
  date: 333,
  statementKind: 226,
  amount: 226,
  category: 226,
  account: 226,
  to: 226,
  expense: 226,
  tags: 226,
  /**
   * The one button the row's actions sit behind. A fixed width: the button is
   * the same size whatever room the column is given, so a share of the page
   * only pushes it away from the grip beside it.
   */
  actions: 72,
  /** The grip a row is dragged by. A fixed width, for the same reason. */
  dragHandle: 72,
} as const;

/** Where a column stops shrinking and the list starts scrolling sideways. */
export const STATEMENT_COLUMN_MIN = {
  /**
   * A date is the longest unavoidable value in the row. Low enough that the
   * list keeps giving way about as far as the table did before either of them
   * resorts to a sideways scroll.
   */
  date: 120,
  /** Everything else: roughly a short amount plus its padding. */
  data: 72,
} as const;
