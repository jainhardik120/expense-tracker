/**
 * The widths the two budget tables share.
 *
 * They sit one above the other on the same page, so a row number, an actions
 * menu and a drag handle have to be the same width in both or nothing lines up
 * down the screen. Stated once here so the two cannot drift apart.
 */
export const BUDGET_COLUMN_SIZE = {
  /** Wide enough for a two-digit position, plus room to breathe at the edge. */
  position: 64,
  actions: 64,
  dragHandle: 48,
  /** Wider than an even share would give it, since it holds a sentence. */
  claims: 320,
} as const;

/**
 * The extra indent on the row number.
 *
 * A cell's padding is the table's own and the same everywhere; this column sits
 * hard against the table's left edge, where that alone reads as too tight.
 */
export const POSITION_INDENT = 'pl-2';
