import { sql } from 'drizzle-orm';

import { type StatementAttributes } from './attributes';
import { statements } from './schema';

export const statementAttribute = <T extends string | null = string | null>(
  key: keyof StatementAttributes,
) => {
  const literal = `'${key}'`;
  return sql<T>`${statements.additionalAttributes}->>${sql.raw(literal)}`;
};
