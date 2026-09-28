/**
 * One set of column widths for both modes.
 *
 * Reading and entering show overlapping sets of columns, and a column that
 * changes width the moment editing starts is a column that moves out from under
 * the pointer. The four the two modes share are stated once here so they cannot
 * drift apart, and the leading gutter is reserved in both so everything after it
 * begins at the same place whether or not there is a tick box in it.
 */
export const SMS_COLUMN_SIZE = {
  /** The tick box when entering; empty space when reading. Reserved in both. */
  gutter: 44,

  // Shown in both modes, so identical in both.
  // Wide enough for "Sep 27, 2026, 07:12 PM" without clipping.
  date: 205,
  amount: 120,
  merchant: 220,
  bank: 140,

  // Reading only.
  account: 100,
  status: 120,
  actions: 80,

  // Entering only.
  kind: 150,
  accountPicker: 160,
  friend: 125,
  category: 160,
  tags: 190,
  rowStatus: 200,
} as const;
