const humanizeColumnId = (id: string) =>
  id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());

export const getColumnLabel = (column: {
  id: string;
  columnDef: { meta?: { label?: string }; header?: unknown };
}) =>
  column.columnDef.meta?.label ??
  (typeof column.columnDef.header === 'string'
    ? column.columnDef.header
    : humanizeColumnId(column.id));
