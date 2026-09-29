/**
 * The widths the statements grid lays its columns out from.
 *
 * A DataTable sizes its columns from their contents; a grid has to be told, and
 * anything that stays silent is given a default too narrow for a full date.
 * These follow the shape the table settles into when there is room to spare:
 * the two control columns stay the size of the control they hold, the date is
 * given a fixed head start over the rest, and every remaining column is equal.
 * Spare width is then split evenly between them, which lands on the table's own
 * widths -- so the two read as the same list, and the grid is the table with
 * its editors switched on rather than a different component.
 *
 * Stated once so reading and correcting cannot drift apart: a column that
 * changed width the moment editing started would move out from under the
 * pointer.
 */
export const STATEMENT_COLUMN_SIZE = {
  /** The tick box. Does not stretch. */
  select: 60,
  /**
   * The head start over the equal columns, enough to hold "September 29, 2026
   * at 11:36 AM" without truncating once the even split is added on top.
   */
  date: 254,
  statementKind: 147,
  amount: 147,
  category: 147,
  account: 147,
  to: 147,
  expense: 147,
  tags: 147,
  /** The one button the row's actions sit behind. */
  actions: 147,
  /** The grip a row is dragged by. Does not stretch. */
  dragHandle: 72,
} as const;
